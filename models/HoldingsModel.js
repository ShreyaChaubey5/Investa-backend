const mongoose = require('mongoose');
const { model } = require("mongoose");
const {HoldingsSchema}=require("../schema/HoldingsSchema");


const HoldingsModel=mongoose.model("Holding",HoldingsSchema);

module.exports={HoldingsModel};