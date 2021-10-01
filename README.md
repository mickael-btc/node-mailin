# Node-Mailin

**Artisanal inbound emails for every web app**
<img align="right" src="postman.jpg"/>

Node-Mailin is an smtp server that listens for emails, parses as json.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Node-Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

### Initial setup

#### Dependencies

Node-Mailin can run without any dependencies other than node itself, but having them allow you to use some additional features.

To handle the spam score computation, Node-Mailin depends on spamassassin and its server interface spamc. Both should be available as packages on your machine. For instance on Debian/Ubuntu boxes:

Spamassassin is not enabled by default, enable it in with update-rc.d spamassassin enable command.

```
sudo aptitude install spamassassin spamc
sudo update-rc.d spamassassin enable
sudo service spamassassin start
```

#### Node versions

Current LTS and LTS+ versions.

#### The crux: setting up your DNS correctly

In order to receive emails, your smtp server address should be made available somewhere. Two records should be added to your DNS records. Let us pretend that we want to receive emails at `*@subdomain.domain.com`:

- First an MX record: `subdomain.domain.com MX 10 mxsubdomain.domain.com`. This means that the mail server for addresses like `*@subdomain.domain.com` will be `mxsubdomain.domain.com`.
- Then an A record: `mxsubdomain.domain.com A the.ip.address.of.your.Node-Mailin.server`. This tells at which ip address the mail server can be found.

You can fire up Node-Mailin (see next section) and use an [smtp server tester](http://mxtoolbox.com/diagnostic.aspx) to verify that everything is correct.

### Using Node-Mailin

#### From the command line

Install Node-Mailin globally.

```
npm i https://github.com/mickael-btc/node-mailin.git
```


Start the node-mailin server and listen to events.

```javascript
"use strict";

const nodeMailin = require("../lib/node-mailin");
const fs = require("fs");

nodeMailin.start({
  host: "0.0.0.0",
  port: 25, // run as root
  disableSpamReport: false,
  logLevel: "silly", // One of silly, info, debug, warn, error
  smtpOptions: {
    banner: "NODEMAILIN SMTP SERVER",
    disabledCommands: ["AUTH"],
    key: fs.readFileSync("path/to/server/tls/key.pem"),
    cert: fs.readFileSync("path/to/server/tls/cert.pem"),
  },
});

/* Access simplesmtp server instance. */
nodeMailin.on("authorizeUser", function (connection, username, password, done) {
  if (username == "nodejs124" && password == "passy@1234") {
    done(null, true);
  } else {
    done(new Error("Unauthorized!"), false);
  }
});

/* Event emitted when the "From" address is received by the smtp server. */
nodeMailin.on("validateSender", async function (session, address, callback) {
  if (address == "foo@bar.com") {
    /*blacklist a specific email adress*/
    err = new Error("You are blocked"); /*Will be the SMTP server response*/
    err.responseCode = 530; /*Will be the SMTP server return code sent back to sender*/
    callback(err);
  } else {
    callback();
  }
});

/* Event emitted when the "To" address is received by the smtp server. */
nodeMailin.on("validateRecipient", async function (session, address, callback) {
  console.log(address);
  /* Here you can validate the address and return an error
   * if you want to reject it e.g:
   *     err = new Error('Email address not found on server');
   *     err.responseCode = 550;
   *     callback(err);*/
  callback();
});

/* Event emitted when a connection with the nodeMailin smtp server is initiated. */
nodeMailin.on("startMessage", function (connection) {
  /* connection = {
        from: 'sender@gmail.com',
        to: 'someaddress@yahoo.com',
        id: 'hffj7656',
        authentication: { username: null, authenticated: false, status: 'NORMAL' }
      }
    }; */
  console.log(connection);
});

/* Event emitted after a message was received and parsed. */
nodeMailin.on("message", (connection, data, content) => {
  console.log(data); //Object with all email data like html text
  // Use parsed message `data` directly or use raw message `content`. */
});

/* Event emitted on error. */
nodeMailin.on("error", async (error) => {
  console.log(error);
});

```

##### Rejecting an incoming email

You can reject an incoming email when the **validateRecipient** or **validateSender** event gets called and you run the callback with an error (Can be anything you want, preferably an [actual SMTP server return code](https://en.wikipedia.org/wiki/List_of_SMTP_server_return_codes))
```javascript
nodeMailin.on('validateSender', async function(session, address, callback) {
    if (address == 'foo@bar.com') {         /*blacklist a specific email adress*/
        err = new Error('Email address was blacklisted'); /*Will be the SMTP server response*/
        err.responseCode = 530;             /*Will be the SMTP server return code sent back to sender*/
        callback(err);                      /*Run callback with error to reject the email*/
    } else {
        callback()                          /*Run callback to go to next step*/
    }
});
```

##### Gotchas
- `error: listen EACCES`: your user do not have sufficients privileges to run on the given port. Ports under 1000 are restricted to root user. Try with [sudo](http://xkcd.com/149/).
- `error: listen EADDRINUSE`: the current port is already used by something. Most likely, you are trying to use port 25 and your machine's [mail transport agent](http://en.wikipedia.org/wiki/Message_transfer_agent) is already running. Stop it with something like `sudo service exim4 stop` or `sudo service postfix stop` before using Node-Mailin.
- `error: Unable to compute spam score ECONNREFUSED`: it is likely that spamassassin is not enabled on your machine, check the `/etc/default/spamassassin` file.
- `node: command not found`: most likely, your system does not have node installed or it is installed with a different name. For instance on Debian/Ubuntu, the node interpreter is called nodejs. The quick fix is making a symlink: `ln -s $(which nodejs) /usr/bin/node` to make the node command available.
- `Uncaught SenderError: Mail from command failed - 450 4.1.8 <an@email.address>: Sender address rejected: Domain not found`: The smtpOption `disableDNSValidation` is set to `false` and an email was sent from an invalid domain.


##### Events

- **startData** _(connection)_ - DATA stream is opened by the client.
- **data** _(connection, chunk)_ - E-mail data chunk is passed from the client.
- **dataReady** _(connection, callback)_ - Client has finished passing e-mail data. `callback` returns the queue id to the client.
- **authorizeUser** _(connection, username, password, callback)_ - Emitted if `requireAuthentication` option is set to true. `callback` has two parameters _(err, success)_ where `success` is a Boolean and should be true, if user is authenticated successfully.
- **validateSender** _(connection, email, callback)_ - Emitted if `validateSender` listener is set up.
- **senderValidationFailed** _(connection, email, callback)_ - Emitted if a sender DNS validation failed.
- **validateRecipient** _(connection, email, callback)_ - Emitted if `validateRecipients` listener is set up.
- **recipientValidationFailed** _(connection, email, callback)_ - Emitted if a recipient DNS validation failed.
- **close** _(connection)_ - Emitted when the connection to a client is closed.
- **startMessage** _(connection)_ - Connection with the Node-Mailin smtp server is initiated.
- **message** _(connection, data, content)_ - Message was received and parsed.
- **error** _(error)_ - And Error Occured.


### Credits

- Postman image copyright [Charlie Allen](http://charlieallensblog.blogspot.fr)
- Forked from https://github.com/vithalreddy/node-mailin
