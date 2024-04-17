const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { Web3 } = require("web3");
require('dotenv').config()

async function main() {
  var abi2 = require('./tj.json');
  var last15transfer = [];
  const app = express();
  app.use(cors());
  var last15trade = [];
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ["GET", "POST"]
    }
  })
  const PORT = 2000;
  io.on("connection", (socket) => {
    socket.emit('last15Transfer', last15transfer)
    socket.emit('last15Trades', last15trade)


  })
  server.listen(PORT, () => {
    console.log("server started ", PORT)
  })
  const web3 = new Web3("https://api.avax.network/ext/bc/C/rpc");

  let options = {
    topics: [web3.utils.sha3("ERC20Transfer(address,address,uint256)")],
  };
  let options2 = {
    address: '0x8e9345693be8F6571F1cC73fE0Da614A87133468',
    topics: [web3.utils.sha3("Swap(address,uint256,uint256,uint256,uint256,address)")]
  }

  let subscription2 = await web3.eth.subscribe("logs", options2);
  let subscription = await web3.eth.subscribe("logs", options);

  async function collectData(contract) {
    try {
      var decimals = await contract.methods.decimals().call();
    }
    catch {
      decimals = 18n;
    }
    try {
      var symbol = await contract.methods.symbol().call();
    }
    catch {
      symbol = '???';
    }
    return { decimals, symbol };
  }
  subscription2.on("data", (event) => {
    let transaction = web3.eth.abi.decodeLog(
      [
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount0In",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount1In",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount0Out",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount1Out",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        }
      ],
      event.data, [event.topics[0], event.topics[1], event.topics[2]],
    );

    const tx = {
      txHash: event.transactionHash,
      amount: transaction.amount1In !=BigInt(0) ? web3.utils.fromWei(transaction.amount1In, "ether") : web3.utils.fromWei(transaction.amount1Out, "ether"),
      price: transaction.amount1In != BigInt(0) ? Number(transaction.amount0Out) / Number(transaction.amount1In) : Number(transaction.amount0In)/ Number(transaction.amount1Out),
      isBuy: transaction.amount1In != BigInt(0) ? false : true
    }
    console.log(event)
    console.log(tx)
    io.emit("newBuy", tx)
    last15trade.unshift(tx)
    if (last15trade.length > 15) {
      last15trade.pop()
    }
  })
  subscription.on("data", (event) => {
    if (event.topics.length == 3) {
      let transaction = web3.eth.abi.decodeLog(
        [
          {
            type: "address",
            name: "from",
            indexed: true,
          },
          {
            type: "address",
            name: "to",
            indexed: true,
          },
          {
            type: "uint256",
            name: "value",
            indexed: false,
          },
        ],
        event.data,
        [event.topics[0], event.topics[1], event.topics[2]],
      );

      const contract = new web3.eth.Contract(abi2, event.address);
      collectData(contract).then((contractData) => {
        var unit = Object.keys(web3.utils.ethUnitMap).find(
          (key) => web3.utils.ethUnitMap[key] == (BigInt(10) ** contractData.decimals)
        );
        if (!unit) {

          unit = "wei"
        }
        const value = web3.utils.fromWei(transaction.value, unit);
        if (event.address == "0x1a072cB165af29a569F1463B59D4C16448aCCaFa".toLowerCase() && transaction.from == "0x0000000000000000000000000000000000000000") {
          const transfer = {
            txHash: event.transactionHash,
            to: transaction.to,
            value: value,
            time: Date.now()
          }
          last15transfer.unshift(transfer)
          if (last15transfer.length > 15) {
            last15transfer.pop()
          }
          console.log(`Xavax Transfer ${value + ' ' + transaction.from + ' ' + transaction.to}`)
          io.emit("airdrop", transfer)
        }
      });
    }
  });

}
main()