/*
 * 
 *  Blockstrap v0.6.0.1
 *  http://blockstrap.com
 *
 *  Designed, Developed and Maintained by Neuroware.io Inc
 *  All Work Released Under MIT License
 * 
 */
(function($) 
{
    var blockchains = {};
    var temp_blockchain_validation = [
        {
            "code": "btc",
            "starts": ['1', '3']
        },
        {
            "code": "ltc",
            "starts": ['L']
        },
        {
            "code": "dash",
            "starts": ['X']
        },
        {
            "code": "doge",
            "starts": ['D']
        },
        {
            "code": "btct",
            "starts": ['m', 'n']
        },
        {
            "code": "ltct",
            "starts": ['m, n']
        },
        {
            "code": "dasht",
            "starts": ['y']
        },
        {
            "code": "doget",
            "starts": ['n']
        }
    ];
    
    blockchains.check = function(address)
    {
        try 
        {
            var decoded_hex = Crypto.util.base64ToBytes(address);
        } 
        catch(error) 
        {
            // if decoding fails, assume invalid address
            return false;
        }
        var decoded = bitcoin.Script.fromHex(decoded_hex).toBuffer();
        if (decoded.length != 25) {
            return false;
        }
        // IF PASSING THIS FAR RETURN BACK FIRST CHARACTER OF ADDRESS
        // THIS CAN THEN BE USED FOR TEMPORARY BLOCKCHAIN VERIFICATION
        return address.charAt(0);
    }
    
    blockchains.decode = function(script_pub_key)
    {
        var str = '';
        var op_return = bitcoin.Script.fromHex(script_pub_key).toASM();
        var op_array = op_return.split(' ');
        if(blockstrap_functions.array_length(op_array) == 2)
        {
            var hex = op_array[1];
            for (var i = 0; i < hex.length; i += 2)
            {
                str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            }
        }
        else if(blockstrap_functions.array_length(op_array) == 5)
        {
            var hex = op_array[2];
            for (var i = 0; i < hex.length; i += 2)
            {
                str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            }
        }
        return str;
    }
    
    blockchains.key = function(code)
    {
        var bs = $.fn.blockstrap;
        if(!code) code = 'btc';
        if(
            !$.isPlainObject(bs.settings.blockchains) 
            || !$.isPlainObject(bs.settings.blockchains[code]) 
            || typeof bs.settings.blockchains[code].lib == 'undefined'
        ){
            code = 'btc';
        }
        if(
            $.isPlainObject(bs.settings.blockchains[code]) 
            && typeof bs.settings.blockchains[code].lib != 'undefined'
        ){
            return bs.settings.blockchains[code].lib;
        }
        else
        {
            return 'bitcoin';
        }
    }
    
    blockchains.keys = function(secret, blockchain, number_of_keys, indexes, raw)
    {
        var keys = {};
        var is_array = false;
        var secrets = secret;
        var blockchain_key = blockchains.key(blockchain);
        var blockchain_obj = bitcoin.networks[blockchain_key];
        if(typeof raw == 'undefined') raw = false;
        if(typeof number_of_keys != 'undefined' && parseInt(number_of_keys) > 1)
        {
            keys = [];
            is_array = true;
        }
        try
        {
            if(is_array)
            {
                for (i = 0; i < parseInt(number_of_keys); i++) 
                {
                    var hash = bitcoin.crypto.sha256(secrets);
                    var raw_keys = bitcoin.HDNode.fromSeedBuffer(hash, blockchain_obj);
                    keys.push({
                        pub: raw_keys.pubKey.getAddress(blockchain_obj).toString(),
                        hex: raw_keys.pubKey.toHex(),
                        priv: raw_keys.privKey.toWIF(blockchain_obj)
                    });
                    secrets = CryptoJS.SHA3(secrets + raw_keys.privKey.toWIF(blockchain_obj), { outputLength: 512 }).toString();
                }
                if(raw) keys.raw = raw_keys;
                return keys;
            }
            else
            {
                var hash = bitcoin.crypto.sha256(secrets);
                var raw_keys = bitcoin.HDNode.fromSeedBuffer(hash, blockchain_obj);
                if(typeof indexes != 'undefined' && $.isArray(indexes))
                {
                    $.each(indexes, function(k, index)
                    {
                        raw_keys = raw_keys.derive(index);
                    });
                }
                keys.pub = raw_keys.pubKey.getAddress(blockchain_obj).toString();
                keys.priv = raw_keys.privKey.toWIF(blockchain_obj);
                if(raw) keys.raw = raw_keys;
                return keys;
            }
        }
        catch(error)
        {
            if(is_array)
            {
                keys.push({
                    pub: false,
                    priv: false
                });
                if(raw) keys.raw = false;
                return keys;
            }
            else
            {
                keys.pub = false;
                keys.priv = false;
                if(raw) keys.raw = false;
                return keys;
            }
        }
    }
    
    blockchains.raw = function(return_to, private_keys, inputs, outputs, this_fee, amount_to_send, data, sign_tx, script)
    {
        tx = new bitcoin.TransactionBuilder();
        
        if(typeof sign_tx == 'undefined') sign_tx = true;
        
        var fee = 0;
        var balance = 0;
        var total = 0;
        var input_index = 0;
        var key = false;
        var inputs_to_sign = [];
        var debug = false;
        if(typeof private_keys == 'string')
        {
            key = bitcoin.ECKey.fromWIF(private_keys);
        }
        else if($.isArray(private_keys))
        {
            var redeem_script = script;
        }
        if(this_fee) fee = this_fee;
        if(amount_to_send) total = amount_to_send;
        if(debug)
        {
            console.log('inputs', inputs);
            console.log('outputs', outputs);
        }
        $.each(inputs, function(i, o)
        {
            if(balance <= (amount_to_send + fee))
            {
                balance+= o.value;
                tx.addInput(o.txid, o.n);
                inputs_to_sign.push(input_index);
                input_index++;
            }
        });
        
        var bs_op_code = false;
        if($.isPlainObject(data) && typeof data.type != 'undefined' && data.type == 'bs_op')
        {
            if(typeof data.op != 'undefined' && data.op)
            {
                bs_op_code = data.op;
            }
            data = data.value;
        }
        
        if(bs_op_code === 1)
        {
            if(typeof data == 'string' && data)
            {
                var op = Crypto.util.base64ToBytes(btoa(data));
                var op_out = bitcoin.Script.fromHex(op).toBuffer();
                var op_return = bitcoin.Script.fromChunks(
                [
                    bitcoin.opcodes.OP_RETURN,
                    op_out
                ]);
                tx.addOutput(op_return, 0);
                if(tx.tx.outs[0].value === 0) tx.tx.outs[0].type = "nulldata";
            }
        }
        
        $.each(outputs, function(i, o)
        {
            tx.addOutput(o.address, o.value)
        });
        
        var change = balance - total;
        
        if(bs_op_code === 2)
        {
            if(typeof data == 'string' && data)
            {
                var op = Crypto.util.base64ToBytes(btoa(data));
                var op_out = bitcoin.Script.fromHex(op).toBuffer();
                var op_return = bitcoin.Script.fromChunks(
                [
                    bitcoin.opcodes.OP_RETURN,
                    op_out
                ]);
                tx.addOutput(op_return, 0);
                if(tx.tx.outs[blockstrap_functions.array_length(outputs)].value === 0) tx.tx.outs[blockstrap_functions.array_length(outputs)].type = "nulldata";
                tx.addOutput(return_to, fee);
            }
        }
        
        if(typeof data == 'string' && data && (bs_op_code != 1 && bs_op_code != 2))
        {
            var op = Crypto.util.base64ToBytes(btoa(data));
            var op_out = bitcoin.Script.fromHex(op).toBuffer();
            var op_return = bitcoin.Script.fromChunks(
            [
                bitcoin.opcodes.OP_RETURN,
                op_out
            ]);
            tx.addOutput(op_return, 0);
            var output_index = blockstrap_functions.array_length(outputs);
            if(tx.tx.outs[output_index].value === 0) tx.tx.outs[output_index].type = "nulldata";
        }
        
        if((change - fee) > 0 && !bs_op_code) 
        {
            tx.addOutput(return_to, (change - fee));
        }
        
        $.each(inputs_to_sign, function(k)
        {
            if(sign_tx)
            {
                if($.isArray(private_keys))
                {
                    $.each(private_keys, function(private_key, key)
                    {
                        tx.sign(k, bitcoin.ECKey.fromWIF(key), bitcoin.Script.fromHex(redeem_script));
                    });
                }
                else
                {
                    tx.sign(k, key);
                }
            }
        });

        var built = tx.build();
        var raw = built.toHex();
        
        if(debug)
        {
            console.log('raw', raw);
            return false;
        }
        else return raw;
    }
    
    blockchains.send = function(
        to_address, 
        to_amount, 
        from_address, 
        keys, 
        callback, 
        blockchain,
        data,
        selected_fee
    ){
        var available_balance = 0;
        var private_key = keys.priv;
        if(!blockchain) blockchain = 'btc';
        var fee = $.fn.blockstrap.settings.blockchains[blockchain].fee * 100000000;
        if(typeof selected_fee != 'undefined') fee = selected_fee;
        $.fn.blockstrap.api.balance(from_address, blockchain, function(balance)
        {
            if(
                (
                    blockchain != $.fn.blockstrap.blockchains.which(to_address)
                    || blockchain != $.fn.blockstrap.blockchains.which(from_address)
                )
                &&
                (
                    blockchain == 'ltct'
                    && 
                    (
                        $.fn.blockstrap.blockchains.which(to_address) != 'btct'
                        || $.fn.blockstrap.blockchains.which(from_address) != 'btct'
                    )
                )
            ){
                $.fn.blockstrap.core.loader('close');
                var content = 'Incompatible addresses. Please ensure you are sending to and from the same blockchain.';
                setTimeout(function()
                {
                    $.fn.blockstrap.core.modal('Warning', content);
                }, $.fn.blockstrap.core.timeouts('loader'));
                return false;
            }
            else if(balance - fee >= to_amount)
            {
                $.fn.blockstrap.api.unspents(keys.pub, blockchain, function(unspents)
                {
                    if($.isArray(unspents))
                    {
                        var inputs = [];
                        var outputs = [{
                            'address': to_address,
                            'value': to_amount
                        }];
                        $.each(unspents, function(k, unspent)
                        {
                            inputs.push({
                                txid: unspent.txid,
                                n: unspent.index,
                                script: unspent.script,
                                value: unspent.value,
                            });
                            //available_balance = available_balance + unspent.value;
                        });
                        var raw_transaction = blockchains.raw(
                            from_address, 
                            private_key, 
                            inputs, 
                            outputs, 
                            fee, 
                            to_amount,
                            data
                        );
                        $.fn.blockstrap.api.relay(raw_transaction, blockchain, function(tx)
                        {
                            if(tx && tx.txid)
                            {
                                if(callback) callback(tx);
                            }
                            else
                            {
                                $.fn.blockstrap.core.loader('close');
                                setTimeout(function()
                                {
                                    if(callback) callback(false);
                                }, $.fn.blockstrap.core.timeouts('loader'));
                            }
                        });
                    }
                    else
                    {
                        $.fn.blockstrap.core.loader('close');
                        setTimeout(function()
                        {
                            if(callback) callback(false);
                        }, $.fn.blockstrap.core.timeouts('loader'));
                    }
                });
            }
            else
            {
                var content = 'Insufficient funds to relay transaction.';
                $.fn.blockstrap.core.modal('Warning', content);
                if(callback) callback(false);
            }
        });
    }
    
    blockchains.supported = function(blockchain)
    {
        if(
            typeof blockchain != 'undefined'
            && typeof $.fn.blockstrap.settings.blockchains != 'undefined'
            && $.isPlainObject($.fn.blockstrap.settings.blockchains)
        ){
            if(typeof index == 'undefined') index = 0;
            var bc_count = 0;
            var chains = $.fn.blockstrap.settings.blockchains;
            if(typeof chains[blockchain] != 'undefined') return true;
            else return false;
        }
        else
        {
            return false;
        }
    }
    
    blockchains.validate = function(address)
    {
        if($.isPlainObject(address) && typeof address.address != 'undefined')
        {
            address = address.address;
        }
        try 
        {
            var results = blockchains.check(address);
            return results;
        } 
        catch(e) 
        {
            return false;
        }
    }
    
    blockchains.which = function(address)
    {
        try 
        {
            var key = blockchains.validate(address);
        } 
        catch(error) 
        {
            // if decoding fails, assume invalid address
            return false;
        }
        // TODO: NEED PROPER CHECKSUM HANDLING HERE
        // LATEST VERSION OF BITCOINJS-LIB SEEMED TO BE MISSING IT :-(
        // FOR NOW - WE WILL USE A HACKY CHECK ON ADDRESSES
        var blockchain = false;
        if($.isArray(temp_blockchain_validation))
        {
            $.each(temp_blockchain_validation, function(k, coin)
            {
                $.each(coin.starts, function(index, character)
                {
                    if(character == key) blockchain = coin.code;
                });
            });
        }
        return blockchain;
    }
    
    // MERGE THE NEW FUNCTIONS WITH CORE
    $.extend(true, $.fn.blockstrap, {blockchains:blockchains});
})
(jQuery);
