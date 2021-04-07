// LEGACY TRUSTEDCOIN OFFLINE SIGNING SCRIPT ///////////////////////////////////////////
//
// This script allows you to sweep your entire Trustedcoin wallet balance to a new
// address.  This only applies to wallets created using the Trustedcoin web wallet
// from 2013-2017.
//
// Instructions: 
//
// 1. run "npm install mnemonic@1.0.1"
// 2. run "npm install bitcore-lib@8.25.7"
// 3. update all variables from walletAddress ... feeSatoshisPerByte as instructed
// 4. running "node sweep_trustedcoin_wallet.js" will output a raw (hex) transaction 
// 5. broadcast the output of (4) using https://www.blockchain.com/btc/pushtx
// 
////////////////////////////////////////////////////////////////////////////////////////

// VARIABLES YOU NEED TO CHANGE ////////////////////////////////////////////////////////

// Replace with your Trustedcoin wallet address
let walletAddress = '3Q6RBMUMqzgzbAec4bwqX2hiyDi28ne8wd';
// Find your trustedcoinPubkey by going to https://api.trustedcoin.com/1/cosigner/<walletAddress>
let trustedcoinPubKey = '02930458814b09493257f2a80825e838ac71a631c484e2d4813567237f3cc11bd2';
// Replace with your primary wallet mnemonic
let primaryMnemonic = 'juice something roll weak pie mend tomorrow came hope girlfriend least forest';
// Replace with your secondary wallet mnemonic
let secondaryMnemonic = 'sharp inch certainly clock inner normal force color mend silent drum faith';
// Fetch https://blockchain.info/unspent?active=<walletAddress> and assign the literal JSON reply to blockchainDotInfoUnspent
let blockchainDotInfoUnspent = {"notice":"","unspent_outputs":[]}
// Replace this with where you want to send your coins
let sweepDestination = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
// Modify as appropriate; See https://bitcoinfees.earn.com/ for prevailing fees
let feeSatoshisPerByte = 50;

////////////////////////////////////////////////////////////////////////////////////////

const mnemonic = require('mnemonic');
const bitcore = require('bitcore-lib');

function guessTransactionSize(numInputs, numOutputs, redeemScriptSize=105) {
	return 10 + numOutputs * 34 + numInputs * (192 + redeemScriptSize);
}

function electrumStretchSeed(seed) {
    let result = seed;
    for ( let i = 0; i < 100000; i++ ) {
        let combined = bitcore.util.buffer.concat([result, seed]);
        result = bitcore.crypto.Hash.sha256(combined);
    }
    return result;
}

function seedToPrivateKey(seed) {
    let secp256k1 = new bitcore.deps.elliptic.ec('secp256k1');
    let seedN = bitcore.crypto.BN.fromBuffer(seed);
    let point = secp256k1.g.mul(seed);
    let mpk = bitcore.deps.Buffer.from(point.encode().slice(1));
    let combined = bitcore.util.buffer.concat([bitcore.deps.Buffer.from('0:0:'), mpk]);
    let offset = bitcore.crypto.Hash.sha256sha256(combined);
    let offsetN = bitcore.crypto.BN.fromBuffer(offset);
    return bitcore.PrivateKey(seedN.add(offsetN).mod(secp256k1.n));
}

function mnemonicToPrivateKey(mnemonicPhrase) {
    let seedHex = mnemonic.decode(mnemonicPhrase.split(' '));
    let seed = bitcore.deps.Buffer.from(seedHex);
    let stretchedSeed = electrumStretchSeed(seed);
    return seedToPrivateKey(stretchedSeed);
}

let primaryKey = mnemonicToPrivateKey(primaryMnemonic);
let secondaryKey = mnemonicToPrivateKey(secondaryMnemonic);

let publicKey1 = new bitcore.PublicKey(primaryKey);
let publicKey2 = new bitcore.PublicKey(trustedcoinPubKey);
let publicKey3 = new bitcore.PublicKey(secondaryKey);

let keys = [publicKey1, publicKey2, publicKey3];

let transaction = new bitcore.Transaction();

let walletBalanceSatoshis = 0;

for ( let i = 0; i < blockchainDotInfoUnspent.unspent_outputs.length; i++ ) {
	let utxo = new bitcore.Transaction.UnspentOutput({
	 	'txId' : blockchainDotInfoUnspent.unspent_outputs[i]['tx_hash_big_endian'],
		'outputIndex': blockchainDotInfoUnspent.unspent_outputs[i]['tx_output_n'],
		'satoshis': blockchainDotInfoUnspent.unspent_outputs[i]['value'],
		'script': blockchainDotInfoUnspent.unspent_outputs[i]['script'],
		'address': walletAddress
	});
	walletBalanceSatoshis += utxo.satoshis;
	transaction = transaction.from(utxo, keys, 2, {noSorting: true})
}

let minerFee = feeSatoshisPerByte * guessTransactionSize(blockchainDotInfoUnspent.unspent_outputs.length, 1);
let sweepAmountSatoshis = walletBalanceSatoshis - minerFee;

console.log('balance', walletBalanceSatoshis/1e8, 'btc');
console.log('fee', minerFee/1e8, 'btc');
console.log('sendable', sweepAmountSatoshis/1e8, 'btc');

transaction = transaction.to(sweepDestination, sweepAmountSatoshis).sign(primaryKey).sign(secondaryKey);

if ( transaction.isFullySigned() ) {
	console.log('raw bitcoin trasaction (paste to https://www.blockchain.com/btc/pushtx to broadcast)')
	console.log(transaction.toBuffer().toString('hex'));
} else { 
	console.log('error signing tx');
}
