# Nyquist Sampling Demonstrator

A small interactive teaching tool for undergraduate physics and data analysis. Change a sine wave's frequency, sampling cadence, and observation duration to compare the true signal, discrete samples, signed alias curve, and single-sided Fourier amplitude spectrum.

## Run locally

Open `index.html` in a modern browser. Everything runs in the browser: no backend, dependencies, CDN, Node server, or build step is needed. It also works offline. Optionally serve the directory with `python3 -m http.server 8000` and open `http://localhost:8000`.

## Deploy with GitHub Pages

1. Push this repository to GitHub.
2. Go to repository **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select **main** and **/ (root)** and save. If your default branch has another name, select it instead.
4. Once GitHub finishes deploying, visit the displayed URL, usually `https://username.github.io/sampling/`.

The site uses relative links, so it works both at a domain root and under a repository path.

## Mathematics and teaching notes

- Sampling frequency is `fs = 1/Δt`; Nyquist is `fs/2`. Cadence is the only input controlling both.
- Reduce the true frequency modulo `fs`, then fold it into `[0, fs/2]`. The dashed alias uses the signed folded frequency, preserving the sample values (for example, 3 Hz sampled at 4 Hz matches a **negative** 1 Hz sine).
- Samples occur at `0, Δt, 2Δt, … < T`. The sample count is `ceil(T/Δt)`, allowing for floating-point roundoff.
- The direct discrete Fourier transform uses **only those samples**. Amplitudes are `2|DFT|/N`, except DC and the even-length Nyquist bin, which use `|DFT|/N`. A unit sine on a Fourier bin below Nyquist has amplitude approximately one.
- Nominal resolution is `1/T`; actual Fourier spacing is `1/(NΔt)`. These coincide when `T/Δt` is an integer. A non-integer number of cycles causes spectral leakage; the strongest bin need not exactly equal the analytic frequency. No window or zero padding is used.
- The basic Nyquist criterion requires a frequency **strictly below** Nyquist. At exact Nyquist, this zero-phase sine has all-zero samples, and there is no detectable peak. Integer multiples of `fs` also vanish. A single sample cannot measure a frequency.
- Longer duration improves resolution; shorter cadence raises Nyquist. Below Nyquist alone does not guarantee a useful frequency estimate from a very short observation.

Inputs are bounded to 0.01–10 Hz, 0.01–2 seconds cadence, and 0.02–30 seconds duration: at most 3,000 samples and 30,001 fine-grid points. Invalid partial numeric edits retain the last valid plot; leaving a field clamps it to the allowed range.

## Example checks

With duration 10 s and cadence 0.25 s, `fs = 4 Hz`, Nyquist is 2 Hz, there are 40 samples, and the bins are separated by 0.1 Hz:

| Signal | Expected observed frequency | Dominant DFT bin |
| --- | --- | --- |
| 1 Hz | 1 Hz | 1 Hz |
| 3 Hz | 1 Hz | 1 Hz |
| 5 Hz | 1 Hz | 1 Hz |

At the same cadence, increasing duration to 20 s leaves Nyquist at 2 Hz and reduces spacing to 0.05 Hz. Keeping duration at 10 s and reducing cadence to 0.125 s raises Nyquist to 4 Hz while leaving spacing at 0.1 Hz.

## Modify the tool

`index.html` contains the controls and explanations, `style.css` controls the layout, and `script.js` contains the numerical routines and SVG plots. The `Sampling` routines are independent of the DOM; plotting and input handling follow them. Native input controls support keyboard interaction, and plots include text summaries and sample tooltips.
