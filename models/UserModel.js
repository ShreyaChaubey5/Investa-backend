const mongoose = require('mongoose');
const { model } = require("mongoose");
const {UserSchema}=require("../schema/UserSchema");


const UserModel=mongoose.model("user",UserSchema);

module.exports={UserModel};