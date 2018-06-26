Brave Redirection Recorder
===

Description
---
Headless chromium-based Lambda function used for detecting and recording
automated redirections online.  It records redirections using the
chrome [devtools protocol](https://chromedevtools.github.io/devtools-protocol/),
and writes the results to S3. It then kicks off a different Lambda function
that is responsible for processing that network traffic into Neptune based
graph.

Notes
---
Running `npm install` will download Chromium (~170m), b/c of the
[puppeteer](https://www.npmjs.com/package/puppeteer) dependency.  This function
doesn't bundles and uses a much smaller, stripped down version of chromium,
designed for running in Lambda functions.  To avoid this unnecessary download
of Chromium, set the `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` environmental variable
to `true` before running `npm install`.
