"use strict";

// Numerical routines are independent of the interface to make them easy to test.
const Sampling = (() => {
  const TAU = 2 * Math.PI;

  function aliasFrequency(frequency, samplingFrequency) {
    // Reduce modulo fs first, then fold every Nyquist interval, however large f is.
    const remainder = ((frequency % samplingFrequency) + samplingFrequency) % samplingFrequency;
    const signed = remainder > samplingFrequency / 2 ? remainder - samplingFrequency : remainder;
    return { frequency: Math.abs(signed), signed };
  }

  function sampleSignal(frequency, cadence, duration) {
    // Half-open observation [0,T): do not duplicate the endpoint of a full cycle.
    // Remove roundoff near integer T/dt before taking the ceiling.
    const ratio = duration / cadence;
    const count = Math.max(1, Math.ceil(ratio - 1e-10 * Math.max(1, ratio)));
    const times = Array.from({ length: count }, (_, i) => i * cadence);
    const values = times.map(t => {
      const value = Math.sin(TAU * frequency * t);
      return Math.abs(value) < 1e-10 ? 0 : value;
    });
    return { times, values };
  }

  function spectrum(values, cadence) {
    // Direct DFT of the actual samples; no zero padding or interpolation.
    // UI bounds limit this to 3,000 samples (~4.5 million inner iterations).
    const n = values.length;
    const frequencies = [];
    const amplitudes = [];
    for (let k = 0; k <= Math.floor(n / 2); k++) {
      let real = 0;
      let imaginary = 0;
      for (let j = 0; j < n; j++) {
        const angle = TAU * k * j / n;
        real += values[j] * Math.cos(angle);
        imaginary -= values[j] * Math.sin(angle);
      }
      // DC and (for even n) the Nyquist bin have no negative-frequency partner.
      const scale = k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : 2;
      frequencies.push(k / (n * cadence));
      amplitudes.push(scale * Math.hypot(real, imaginary) / n);
    }
    let peakIndex = 0;
    amplitudes.forEach((amplitude, i) => {
      if (amplitude > amplitudes[peakIndex]) peakIndex = i;
    });
    const hasPeak = n >= 2 && Math.max(...values.map(Math.abs)) > 1e-9;
    return { frequencies, amplitudes, binSpacing: 1 / (n * cadence),
      peak: hasPeak ? { frequency: frequencies[peakIndex], amplitude: amplitudes[peakIndex] } : null };
  }

  function analyse(frequency, cadence, duration) {
    const samplingFrequency = 1 / cadence;
    const samples = sampleSignal(frequency, cadence, duration);
    return { frequency, cadence, duration, samplingFrequency, nyquist: samplingFrequency / 2,
      alias: aliasFrequency(frequency, samplingFrequency), samples,
      spectrum: spectrum(samples.values, cadence) };
  }
  return { aliasFrequency, sampleSignal, spectrum, analyse };
})();

// Native SVG plots keep the whole site static and usable offline.
if (typeof document !== "undefined") {
  const $ = id => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const colours = { true: "#187b95", sample: "#173554", alias: "#b94b16" };
  const state = { frequency: 1, cadence: 0.25, duration: 10 };
  const fmt = value => Number(value.toPrecision(5)).toString();
  let updatePending = false;

  function element(tag, attributes = {}, text = "") {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  }

  function createPlot(container, xMax, yMin, yMax, xLabel, yLabel, description) {
    // Adapt the viewBox to the actual available width so labels stay readable on phones.
    const width = Math.max(280, container.clientWidth);
    const height = container.clientHeight || 330;
    const margin = { left: 78, right: 22, top: 32, bottom: 62 };
    const right = width - margin.right;
    const bottom = height - margin.bottom;
    const x = value => margin.left + value / xMax * (right - margin.left);
    const y = value => bottom - (value - yMin) / (yMax - yMin) * (bottom - margin.top);
    const svg = element("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": description });
    svg.append(element("title", {}, description));
    const clipId = `${container.id}-clip`;
    const defs = element("defs");
    const clip = element("clipPath", { id: clipId });
    clip.append(element("rect", { x: margin.left - 4, y: margin.top - 4, width: right - margin.left + 8, height: bottom - margin.top + 8 }));
    defs.append(clip);
    svg.append(defs);
    const ticks = width < 500 ? 4 : 8;
    for (let i = 0; i <= ticks; i++) {
      const value = xMax * i / ticks;
      svg.append(element("line", { x1: x(value), x2: x(value), y1: margin.top, y2: bottom, stroke: "#e5ebf1" }));
      svg.append(element("text", { x: x(value), y: bottom + 24, "text-anchor": "middle" }, fmt(value)));
    }
    for (let i = 0; i <= 4; i++) {
      const value = yMin + (yMax - yMin) * i / 4;
      svg.append(element("line", { x1: margin.left, x2: right, y1: y(value), y2: y(value), stroke: "#e5ebf1" }));
      svg.append(element("text", { x: margin.left - 10, y: y(value) + 5, "text-anchor": "end" }, Number(value.toPrecision(3)).toString()));
    }
    svg.append(element("path", { d: `M${margin.left},${margin.top}V${bottom}H${right}`, fill: "none", stroke: "#aebdcb" }));
    svg.append(element("text", { x: (margin.left + right) / 2, y: height - 12, "text-anchor": "middle", class: "axis-label" }, xLabel));
    svg.append(element("text", { transform: `translate(19 ${(margin.top + bottom) / 2}) rotate(-90)`, "text-anchor": "middle", class: "axis-label" }, yLabel));
    const data = element("g", { "clip-path": `url(#${clipId})` });
    svg.append(data);
    container.replaceChildren(svg);
    return { svg, data, x, y, width, right, bottom, margin };
  }

  function line(plot, xs, ys, colour, dashed = false) {
    const d = xs.map((value, i) => `${i === 0 ? "M" : "L"}${plot.x(value).toFixed(2)},${plot.y(ys[i]).toFixed(2)}`).join(" ");
    plot.data.append(element("path", { d, stroke: colour, "stroke-width": 2, fill: "none", ...(dashed ? { "stroke-dasharray": "8 5", "stroke-width": 2.5 } : {}) }));
  }

  function markers(plot, xs, ys, label, radius = 4) {
    // A single tooltip is reused; invisible hit circles make sparse points easy to inspect.
    const tooltip = element("g", { visibility: "hidden", "pointer-events": "none" });
    const boxWidth = Math.min(260, plot.width - 10);
    const box = element("rect", { width: boxWidth, height: 30, rx: 5, fill: colours.sample });
    const text = element("text", { x: 10, y: 20, class: "tooltip" });
    tooltip.append(box, text);
    xs.forEach((value, i) => {
      const dot = element("circle", { cx: plot.x(value), cy: plot.y(ys[i]), r: radius, fill: colours.sample, stroke: "white", "stroke-width": 1 });
      dot.append(element("title", {}, label(value, ys[i])));
      plot.data.append(dot);
      const hit = element("circle", { cx: plot.x(value), cy: plot.y(ys[i]), r: Math.max(7, radius), fill: "transparent", class: "hit" });
      const show = () => {
        tooltip.setAttribute("visibility", "visible");
        tooltip.setAttribute("transform", `translate(${Math.max(5, Math.min(plot.width - boxWidth - 5, plot.x(value) - boxWidth / 2))},0)`);
        text.textContent = label(value, ys[i]);
      };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => tooltip.setAttribute("visibility", "hidden"));
      plot.data.append(hit);
    });
    plot.svg.append(tooltip);
  }

  function render() {
    const result = Sampling.analyse(state.frequency, state.cadence, state.duration);
    const { frequency, duration, nyquist, samples, alias, spectrum } = result;
    const atNyquist = Math.abs(frequency - nyquist) <= 1e-9 * Math.max(1, nyquist);
    const aliased = frequency > nyquist && !atNyquist;
    $("sampling-value").textContent = `${fmt(result.samplingFrequency)} Hz`;
    $("nyquist-value").textContent = `${fmt(nyquist)} Hz`;
    $("samples-value").textContent = samples.values.length;
    $("resolution-value").textContent = `${fmt(1 / duration)} Hz`;
    $("alias-value").textContent = `${fmt(alias.frequency)} Hz`;
    const messages = [];
    if (atNyquist) {
      messages.push(`Signal is exactly at Nyquist (${fmt(nyquist)} Hz). This zero-phase sine is sampled at its zero crossings, so its samples vanish. Unique recovery requires a frequency strictly below Nyquist.`);
    } else if (aliased) {
      messages.push(`Signal is above the Nyquist frequency and will be aliased to ${fmt(alias.frequency)} Hz.`);
    } else {
      messages.push("Signal is below Nyquist and adequately sampled according to the basic Nyquist criterion.");
    }
    if (samples.values.length < 2) messages.push("Only one sample is available: there is too little data to measure a Fourier frequency. Increase the duration or decrease the cadence.");
    else if (!spectrum.peak && !atNyquist) messages.push("All sampled values are zero: this phase and cadence hide the sine wave, so there is no measurable Fourier peak.");
    $("status").textContent = messages.join(" ");
    $("status").classList.toggle("warning", aliased || atNyquist || !spectrum.peak);
    $("alias-legend").hidden = !aliased;

    // At least 20 fine-grid points per true cycle, bounded by the input limits.
    const fineCount = Math.max(1000, Math.ceil(20 * frequency * duration), Math.ceil(10 * duration / state.cadence));
    const fineTimes = Array.from({ length: fineCount + 1 }, (_, i) => duration * i / fineCount);
    const trueValues = fineTimes.map(t => Math.sin(2 * Math.PI * frequency * t));
    const timePlot = createPlot($("time-plot"), duration, -1.25, 1.25, "Time [s]", "Signal amplitude",
      `True ${fmt(frequency)} Hz sine wave and ${samples.values.length} samples over ${fmt(duration)} seconds${aliased ? `, with an alias at ${fmt(alias.frequency)} Hz` : ""}.`);
    line(timePlot, fineTimes, trueValues, colours.true);
    // A negative folded frequency reverses sine's phase and passes through the samples.
    if (aliased) line(timePlot, fineTimes, fineTimes.map(t => Math.sin(2 * Math.PI * alias.signed * t)), colours.alias, true);
    markers(timePlot, samples.times, samples.values, (t, value) => `t = ${fmt(t)} s · x = ${fmt(value)}`, samples.values.length > 300 ? 2.5 : 4.5);

    const amplitudeMax = Math.max(1.15, ...spectrum.amplitudes.map(a => a * 1.15));
    const fourierPlot = createPlot($("frequency-plot"), nyquist, 0, amplitudeMax, "Frequency [Hz]", "Fourier amplitude",
      `Single-sided amplitude spectrum of the sampled data, from zero to Nyquist at ${fmt(nyquist)} Hz. ${spectrum.peak ? `Dominant Fourier bin: ${fmt(spectrum.peak.frequency)} Hz.` : "No measurable Fourier peak."}`);
    line(fourierPlot, spectrum.frequencies, spectrum.amplitudes, colours.true);
    fourierPlot.svg.append(element("line", { x1: fourierPlot.right, x2: fourierPlot.right, y1: fourierPlot.margin.top, y2: fourierPlot.bottom, stroke: colours.alias, "stroke-dasharray": "5 4" }));
    fourierPlot.svg.append(element("text", { x: fourierPlot.right, y: 20, "text-anchor": "end" }, `Nyquist: ${fmt(nyquist)} Hz`));
    if (spectrum.peak) {
      fourierPlot.data.append(element("line", { x1: fourierPlot.x(spectrum.peak.frequency), x2: fourierPlot.x(spectrum.peak.frequency), y1: fourierPlot.y(spectrum.peak.amplitude), y2: fourierPlot.bottom, stroke: colours.sample, "stroke-dasharray": "3 4" }));
      markers(fourierPlot, [spectrum.peak.frequency], [spectrum.peak.amplitude], (f, a) => `f = ${fmt(f)} Hz · A = ${fmt(a)}`, 5);
    }
    $("peak-value").textContent = spectrum.peak ? `Dominant bin: ${fmt(spectrum.peak.frequency)} Hz` : "No measurable Fourier peak";
    $("spectrum-note").textContent = `DFT of ${samples.values.length} samples · actual bin spacing 1/(NΔt) = ${fmt(spectrum.binSpacing)} Hz. When T/Δt is not an integer, NΔt differs slightly from T. No window or zero padding is applied.${samples.values.length % 2 ? " With an odd number of samples, the last Fourier bin lies below Nyquist." : ""}`;
  }

  function scheduleRender() {
    if (updatePending) return;
    updatePending = true;
    requestAnimationFrame(() => { updatePending = false; render(); });
  }

  Object.keys(state).forEach(key => {
    const number = $(key);
    const slider = $(`${key}-slider`);
    const sync = (source, finish = false) => {
      // Allow transient empty/incomplete edits without creating NaNs or clearing plots.
      const value = source.valueAsNumber;
      const valid = Number.isFinite(value) && value >= Number(number.min) && value <= Number(number.max);
      if (!valid && !finish) { source.setAttribute("aria-invalid", "true"); return; }
      const next = Number.isFinite(value) ? Math.min(Number(number.max), Math.max(Number(number.min), value)) : state[key];
      state[key] = next;
      if (finish || source === slider) number.value = next;
      slider.value = next;
      number.removeAttribute("aria-invalid");
      slider.removeAttribute("aria-invalid");
      scheduleRender();
    };
    number.addEventListener("input", () => sync(number));
    number.addEventListener("change", () => sync(number, true));
    slider.addEventListener("input", () => sync(slider));
  });
  window.addEventListener("resize", scheduleRender);
  render();
}
