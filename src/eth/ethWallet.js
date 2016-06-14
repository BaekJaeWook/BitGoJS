//
// Wallet Object
// BitGo accessor for a specific wallet
//
// Copyright 2014, BitGo, Inc.  All Rights Reserved.
//

var TransactionBuilder = require('../transactionBuilder');
var bitcoin = require('../bitcoin');
var ethereumUtil = require('ethereumjs-util');
var Keychains = require('../keychains');
var PendingApproval = require('../pendingapproval');
var Util = require('../util');
var EthJSUtil = require("ethereumjs-util");
var EthJSABI = require('ethereumjs-abi');


var assert = require('assert');
var common = require('../common');
var Q = require('q');
var _ = require('lodash');

//
// Constructor
// TODO: WORK IN PROGRESS
//
var EthWallet = function(bitgo, wallet) {
  this.bitgo = bitgo;
  this.wallet = wallet;
  this.addresses = [];

  if (wallet.private) {
    this.addresses = wallet.private.addresses;
  }
};

EthWallet.prototype.toJSON = function() {
  return this.wallet;
};

//
// id
// Get the id of this wallet.
//
EthWallet.prototype.id = function() {
  return this.wallet.id;
};

//
// label
// Get the label of this wallet.
//
EthWallet.prototype.label = function() {
  return this.wallet.label;
};

//
// balance
// Get the balance of this wallet.
//
EthWallet.prototype.balance = function() {
  return new ethereumUtil.BN(this.wallet.balance);
};

//
// balance
// Get the spendable balance of this wallet.
// This is the total of all funds available for s(p)ending
//
EthWallet.prototype.spendableBalance = function() {
  return new ethereumUtil.BN(this.wallet.spendableBalance);
};

//
// type
// Get the type of this wallet, e.g. 'eth'
//
EthWallet.prototype.type = function() {
  return this.wallet.type;
};

//
// url
// Get the URL of this wallet
//
EthWallet.prototype.url = function(extra) {
  extra = extra || '';
  return this.bitgo.url('/eth/wallet/' + this.id() + extra);
};

//
// get
// Refetches this wallet and returns it
//
EthWallet.prototype.get = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  var self = this;

  return this.bitgo.get(this.url())
  .result()
  .then(function(res) {
    self.wallet = res;
    return self;
  })
  .nodeify(callback);
};

//
// freeze
// Freeze the wallet for a duration of choice, stopping BitGo from signing any transactions
// Parameters include:
//   limit:  the duration to freeze the wallet for in seconds, defaults to 3600
//
EthWallet.prototype.freeze = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  if (params.duration) {
    if (typeof(params.duration) != 'number') {
      throw new Error('invalid duration - should be number of seconds');
    }
  }

  return this.bitgo.post(this.url('/freeze'))
  .send(params)
  .result()
  .nodeify(callback);
};

//
// delete
// Deletes the wallet
//
EthWallet.prototype.delete = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  return this.bitgo.del(this.url())
  .result()
  .nodeify(callback);
};

/**
 * Rename a wallet
 * @param params
 *  - label: the wallet's intended new name
 * @param callback
 * @returns {*}
 */
EthWallet.prototype.setWalletName = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['label'], [], callback);

  var url = this.url();
  return this.bitgo.put(url)
  .send({ label: params.label })
  .result()
  .nodeify(callback);
};

//
// labels
// List the labels for the addresses in a given wallet
//
EthWallet.prototype.labels = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  var url = this.bitgo.url('/labels/' + this.id());

  return this.bitgo.get(url)
  .result('labels')
  .nodeify(callback);
};

//
// setLabel
// Sets a label on the provided address
//
EthWallet.prototype.setLabel = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['address', 'label'], [], callback);

  var self = this;

  if (!self.bitgo.eth().verifyAddress({ address: params.address })) {
    throw new Error('Invalid Ethereum address: ' + params.address);
  }

  var url = this.bitgo.url('/labels/' + this.id() + '/' + params.address);

  return this.bitgo.put(url)
  .send({ 'label': params.label })
  .result()
  .nodeify(callback);
};

//
// deleteLabel
// Deletes the label associated with the provided address
//
EthWallet.prototype.deleteLabel = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['address'], [], callback);

  var self = this;

  if (!self.bitgo.eth().verifyAddress({ address: params.address })) {
    throw new Error('Invalid Ethereum address: ' + params.address);
  }

  var url = this.bitgo.url('/labels/' + this.id() + '/' + params.address);

  return this.bitgo.del(url)
  .result()
  .nodeify(callback);
};

//
// transactions
// List the transactions for a given wallet
// Options include:
// TODO: Add iterators for start/count/etc
EthWallet.prototype.transactions = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  var args = [];
  if (params.limit) {
    if (typeof(params.limit) != 'number') {
      throw new Error('invalid limit argument, expecting number');
    }
    args.push('limit=' + params.limit);
  }
  if (params.skip) {
    if (typeof(params.skip) != 'number') {
      throw new Error('invalid skip argument, expecting number');
    }
    args.push('skip=' + params.skip);
  }
  if (params.minHeight) {
    if (typeof(params.minHeight) != 'number') {
      throw new Error('invalid minHeight argument, expecting number');
    }
    args.push('minHeight=' + params.minHeight);
  }
  var query = '';
  if (args.length) {
    query = '?' + args.join('&');
  }

  var url = this.url('/tx' + query);

  return this.bitgo.get(url)
  .result()
  .nodeify(callback);
};

//
// transaction
// Get a transaction by ID for a given wallet
EthWallet.prototype.getTransaction = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['id'], [], callback);

  var url = this.url('/tx/' + params.id);

  return this.bitgo.get(url)
  .result()
  .nodeify(callback);
};

//
// Key chains
// Gets the user key chain for this wallet
// The user key chain is typically the first keychain of the wallet and has the encrypted xpriv stored on BitGo.
// Useful when trying to get the users' keychain from the server before decrypting to sign a transaction.
EthWallet.prototype.getEncryptedUserKeychain = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);
  var self = this;

  return self.bitgo.keychains()
  .get({ 'ethAddress': self.addresses[0].address })
  .then(function(keychain) {
    if (!keychain.encryptedXprv) {
      return self.bitgo.reject('No encrypted keychains on this wallet.', callback);
    }
    return keychain;
  })
  .nodeify(callback);
};

//
// getTransactionPreBuildParams
// Gets transaction pre-build parameters on this wallet
//
// Returns:
//  {
//    gasLimit: maximum amount of gas this transaction will likely cost,
//    gasprice: current market rate per gas,
//    nextSequenceId: next sequence id to sign with on the wallet
//  }
//
EthWallet.prototype.getTransactionPreBuildParams = function(params, callback) {
  params = params || {};

  var self = this;
  return this.bitgo.post(this.url('/tx/prebuild'))
  .send({}) // in future we'll send the target destination, value and other data
  .result()
  .nodeify(callback);
};

//
// getOperationSha3ForExecuteAndConfirm
// Helper to pack the transaction parameters into a sha3 for signing.
// Equivalent of sha3(...) in solidity, which gets verified in the contract.
//
// Parameters:
//   recipients: [] array of { toAddress, value, data } objects
//   expireTime: unix timestamp (seconds since 1970) when the first signature will expire
//
var getOperationSha3ForExecuteAndConfirm = function(recipients, expireTime, sequenceId) {
  // Right now we only support 1 recipient
  if (recipients.length != 1) {
    throw new Error("must send to exactly 1 recipient");
  }

  if (typeof(expireTime) !== 'number') {
    throw new Error("expireTime must be number of seconds since epoch");
  }

  if (typeof(sequenceId) !== 'number') {
    throw new Error("sequenceId must be number");
  }

  // Check inputs
  recipients.forEach(function(recipient) {
    if (typeof(recipient.toAddress) !== 'string' ||
      EthJSUtil.stripHexPrefix(recipient.toAddress).length !== 40) {
      throw new Error("Invalid address: " + recipient.toAddress);
    }

    if (typeof(recipient.value) !== 'string') {
      throw new Error("Invalid value for: " + recipient.toAddress + ' - should be of type string in wei');
    }

    if (recipient.data && typeof(recipient.data) !== 'string') {
      throw new Error("Data for recipient " + recipient.toAddress + ' - should be of type hex string');
    }
  });

  var recipient = recipients[0];
  return EthJSUtil.bufferToHex(EthJSABI.soliditySHA3(
    [ "address", "uint", "string", "uint", "uint" ],
    [
      new EthJSUtil.BN(EthJSUtil.stripHexPrefix(recipient.toAddress), 16),
      recipient.value,
      EthJSUtil.stripHexPrefix(recipient.data) || "",
      expireTime,
      sequenceId
    ]
  ));
};

//
// send
// Send a transaction to the Ethereum network via BitGo.
// This method will sign the recipient address, value, data, expireTime and sequenceId.
// BitGo will use the signature and these values to create and sign a transaction to invoke the
// executeAndConfirm method on the wallet contract, which has the following prototype:
//   executeAndConfirm(address _to, uint _value, bytes _data, uint _expireTime, uint _sequenceId, bytes _signature)
//
// executeandconfirm will do a ecrecover on sha3(_to, _value, _data, _expireTime, _sequenceId) and the signature
// and expect the signer address to be an address on the wallet (we call this the "first" signature").
//
// Thus the first signature will come from the one made on this client and the second will be BitGo's signature on the
// transaction that sent to the blockchain.
//
// Parameters:
//   recipients: [] array of { toAddress, value, data } objects
//   expireTime: unix timestamp (seconds since 1970) when the first signature will expire
//   walletPassphrase - the passphrase to be used to decrypt the user key on this wallet OR
//   xprv - the private key in string form
//
// Returns:
//   txHash - the hash of the transaction
//   txHex - the hex of the entire transaction
//
EthWallet.prototype.sendTransaction = function(params, callback) {
  params = _.extend({}, params);
  common.validateParams(params, [], ['message', 'otp'], callback);

  var EXPIRETIME_DEFAULT = 60 * 60 * 24 * 7; // This signature will be valid for 1 week

  if (params.expireTime !== undefined) {
    if (typeof(params.expireTime) == 'number') {
      if (params.expireTime < ((new Date().getTime()) / 1000)) {
        throw new Error('expireTime is before current time');
      }
    } else {
      throw new Error('expecting number of seconds since epoch for expireTime');
    }
  }

  var self = this;

  return Q()
  .then(function() {
    // wrap in case one of these throws
    return Q.all([self.getAndPrepareSigningKeychain(params), self.getTransactionPreBuildParams(params)]);
  })
  .spread(function(keychain, prebuildParams) {
    var secondsSinceEpoch = Math.floor((new Date().getTime()) / 1000);
    var expireTime = params.expireTime || (Math.floor((new Date().getTime()) / 1000) + EXPIRETIME_DEFAULT);

    var operationHash = getOperationSha3ForExecuteAndConfirm(params.recipients, expireTime, prebuildParams.nextSequenceId);
    var signature = Util.ethSignMsgHash(operationHash, Util.xprvToEthPrivateKey(keychain.xprv));

    var txParams = {
      recipients: params.recipients,
      expireTime: expireTime,
      sequenceId: prebuildParams.nextSequenceId,
      operationHash: operationHash,
      signature: signature
    };
    console.dir(txParams);

    return self.bitgo.post(self.url('/tx/send'))
    .send(txParams)
    .result();
  })
  .nodeify(callback);
};

//
// getAndPrepareSigningKeychain
// INTERNAL function to get the user keychain for signing.
// Caller must provider either a keychain, or walletPassphrase or xprv as a string
// If the caller provides the keychain with xprv, it is simply returned.
// If the caller provides the encrypted xprv (walletPassphrase), then fetch the keychain object and decrypt
// Otherwise if the xprv is provided, fetch the keychain object and augment it with the xprv.
//
// Parameters:
//   keychain - keychain with xprv
//   xprv - the private key in string form
//   walletPassphrase - the passphrase to be used to decrypt the user key on this wallet
// Returns:
//   Keychain object containing xprv, xpub and paths
//
EthWallet.prototype.getAndPrepareSigningKeychain = function(params, callback) {
  params = params || {};

  // If keychain with xprv is already provided, use it
  if (typeof(params.keychain) === 'object' && params.keychain.xprv) {
    return Q(params.keychain);
  }

  common.validateParams(params, [], ['walletPassphrase', 'xprv'], callback);

  if ((params.walletPassphrase && params.xprv) || (!params.walletPassphrase && !params.xprv)) {
    throw new Error('must provide exactly one of xprv or walletPassphrase');
  }

  var self = this;

  // Caller provided a wallet passphrase
  if (params.walletPassphrase) {
    return self.getEncryptedUserKeychain()
    .then(function(keychain) {
      // Decrypt the user key with a passphrase
      try {
        keychain.xprv = self.bitgo.decrypt({ password: params.walletPassphrase, input: keychain.encryptedXprv });
      } catch (e) {
        throw new Error('Unable to decrypt user keychain');
      }
      return keychain;
    });
  }

  // Caller provided an xprv - validate and construct keychain object
  var xpub;
  try {
    xpub = bitcoin.HDNode.fromBase58(params.xprv).neutered().toBase58();
  } catch (e) {
    throw new Error('Unable to parse the xprv');
  }

  if (xpub == params.xprv) {
    throw new Error('xprv provided was not a private key (found xpub instead)');
  }

  var walletAddresses = _.map(self.addresses, 'address');
  if (!_.includes(walletAddresses, Util.xpubToEthAddress(xpub))) {
    throw new Error('xprv provided did not correspond to any address on this wallet!');
  }

  // get the keychain object from bitgo to find the path and (potential) wallet structure
  return self.bitgo.keychains().get({ xpub: xpub })
  .then(function(keychain) {
    keychain.xprv = params.xprv;
    return keychain;
  });
};

EthWallet.prototype.listWebhooks = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  return this.bitgo.get(this.url('/webhooks'))
  .send()
  .result()
  .nodeify(callback);
};

EthWallet.prototype.addWebhook = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['url', 'type'], [], callback);

  return this.bitgo.post(this.url('/webhooks'))
  .send(params)
  .result()
  .nodeify(callback);
};

EthWallet.prototype.removeWebhook = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['url', 'type'], [], callback);

  return this.bitgo.del(this.url('/webhooks'))
  .send(params)
  .result()
  .nodeify(callback);
};

module.exports = EthWallet;
