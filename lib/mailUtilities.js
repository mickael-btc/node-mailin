//@ts-check
"use strict";

const shell = require("shelljs");
const dkim = require("dkim");
const Spamc = require("mini-spamc-client");
var SPFValidator = require("spf-validator");

const logger = require("./logger");
const spamc = new Spamc();

/* Verify spamc/spamassassin availability. */

const isSpamcAvailable = shell.which("spamassassin") && shell.which("spamc");

!isSpamcAvailable &&
  logger.warn(
    "Either spamassassin or spamc are not available. Spam score computation is disabled."
  );

/* Provides high level mail utilities such as checking dkim, spf and computing
 * a spam score. */
module.exports = {
  /* @param rawEmail is the full raw mime email as a buffer. */
  validateDkim: function(rawEmail, callback) {
    dkim.verify(rawEmail, (err, data) => {
      if (err) {
        return callback(err);
      } else {
        return callback(null, true);
      }
    });
  },

  validateSpf: function(ip, host = "", email = "", callback) {
    const domain = email.replace(/.*@/, "");
    logger.verbose(`validsting spf for host ${domain} and ip ${ip}`);
    const validator = new SPFValidator(domain);
    // @ts-ignore
    validator.hasRecords((err, hasRecords) => callback(err, hasRecords));
  },

  /* @param rawEmail is the full raw mime email as a string. */
  getSpamReport: function(rawEmail, callback) {
    if (!isSpamcAvailable) {
      return callback(null, {error: true});
    }
    spamc.report(rawEmail.toString(), function(result) {
      logger.verbose(result);
      if (!result) return callback(new Error("Unable to check for spam."));
      callback(null, result);
    });
  }
};
