"use strict";

const indexLib = require("./index");
indexLib.handler({
    url: process.argv[2],
    debug: true,
    seconds: 60,
}, undefined, result => {
    console.log("test is over");
    console.log(result);
});
