//const { Schema } = require("mongoose");
const mongoose = require('mongoose');

const HoldingsSchema=new mongoose.Schema({
    name: String,
    qty: Number,
    avg: Number,
    price: Number,
    pnl:String,
    net: String,
    day: String,
});

module.exports={HoldingsSchema};