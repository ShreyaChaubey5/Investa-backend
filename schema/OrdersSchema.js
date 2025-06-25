 const { Schema } = require("mongoose");


const OrdersSchema=new Schema({
    name: String,
    qty:Number,
    price: Number,
    percent: String,
    isDown:Boolean,
    mode: {
    type: String,
    enum: ["BUY", "SELL"], // restrict to BUY or SELL
  },
});

module.exports={OrdersSchema};