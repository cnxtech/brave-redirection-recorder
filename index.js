/**
 * Entry point for redirection recording lambda function.  The function
 * takes the following arguments.
 *
 * Required:
 * - url {string}: The url to begin crawling from
 *
 * Optional:
 * - bucket {string}: The S3 bucket to record results to.  (Defaults to
 *                    com.brave.research.redirections)
 * - seconds {int}:   The maximum number of seconds to follow redirects for,
 *                    before ending crawling and recording the results to S3.
 *                    If provided, must be > 0 and less <= 300.
 *                    (Defaults to 240).
 * - debug (boolean): Whether to run in debug mode. If true, uses local chrome,
 *                    prints logging information to STDOUT, etc. (Defaults to
 *                    false).
 */

const path = require("path");

const utilsLib = require("./lib/utils");
const crawlLib = require("./lib/crawl");

const localResourcesDir = path.join(__dirname, "resources");
const chromeHeadlessPath = path.join(localResourcesDir, "headless-chromium");

const handler = async (args, _, callback) => {
    const validationResult = utilsLib.validateArgs(args);
    if (validationResult !== undefined) {
        throw validationResult.msg;
    }

    const crawlArgs = {
        url: args.url,
        bucket: args.bucket || "com.brave.research.redirections",
        seconds: (args.seconds || 240) * 1000,
        debug: args.debug || false,
    };

    if (crawlArgs.debug === false) {
        crawlArgs.chromePath = chromeHeadlessPath;
    }

    await crawlLib.crawl(crawlArgs, callback);
};


module.exports.handler = handler;
