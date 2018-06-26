"use strict";

const parseDomain = require("parse-domain");

const urlLib = require("url");

const getHost = url => {
    try {
        return (new urlLib.URL(url)).host;
    } catch (e) {
        return false;
    }
};


const getDomain = url => {
    const host = getHost(url);
    if (host === false) {
        return false;
    }

    const domainParts = parseDomain(host);
    return domainParts && domainParts.domain;
};


module.exports = {
    getHost,
    getDomain,
};
