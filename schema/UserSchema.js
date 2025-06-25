//const { Schema } = require("mongoose");
const mongoose = require('mongoose');

const UserSchema=new mongoose.Schema({
    email: {
    type: String,
    required: true,
    unique: true, // Optional: ensures email is unique
  },
  username: {
    type: String,
    required: true, 
  },
  password: {
    type: String,
    required: true, 
  },
});

module.exports={UserSchema};