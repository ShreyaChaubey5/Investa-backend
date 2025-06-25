require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { HoldingsModel } = require("./models/HoldingsModel");
const { PositionsModel } = require("./models/PositionsModel");
const { OrdersModel } = require("./models/OrdersModel");
const { UserModel} = require("./models/UserModel");
const cors = require("cors");
const WebSocket = require("ws");
const http = require("http");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const verifyToken = require("./Middleware/verifyToken");


const PORT = process.env.PORT || 8080;
const uri = process.env.MONGO_URL;

const app = express();

const server = http.createServer(app);
const jwt = require("jsonwebtoken");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    credentials: true,
  })
);
app.use(cookieParser());

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Optional: Send data periodically
  const interval = setInterval(() => {
    ws.send(JSON.stringify({ time: new Date().toLocaleTimeString() }));
  }, 5000);

  ws.on("close", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });
});

//login and signup

const createSecretToken = (id) => {
  return jwt.sign({ id }, process.env.TOKEN_KEY, {
    expiresIn: 3 * 24 * 60 * 60,
  });
};

//SignUp
app.post("/Signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Input validation
    if (!email || !password || !username) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await UserModel.create({
      email,
      password: hashedPassword,
      username,
    });

    // Generate token
    const token = createSecretToken(user._id);

    // Set cookie
    res.cookie("token", token, {
      withCredentials: true,
      httpOnly: true, // Set to true for security
      sameSite: "Lax",
    });

    // Send response
    res.status(201).json({
      message: "User signed up successfully",
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
      },
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Incoming login:", req.body); // log what is received

    if (!email || !password) {
      console.log("Missing fields");
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      console.log("User not found");
      return res.status(400).json({ success: false, message: "Incorrect email or password" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      console.log("Wrong password");
      return res.status(400).json({ success: false, message: "Incorrect email or password" });
    }

    const token = createSecretToken(user._id);
    res.cookie("token", token, {
      withCredentials: true,
      httpOnly: true,
    });

    console.log("Login success");
    return res.status(200).json({ success: true, message: "User logged in successfully" });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


//get user info

app.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});


//update user info
app.put("/account-settings", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.TOKEN_KEY);
    const { email, password } = req.body;

    const updates = {};
    if (email) updates.email = email;
    if (password) updates.password = await bcrypt.hash(password, 10);

    await UserModel.findByIdAndUpdate(decoded.id, updates);

    res.json({ message: "Account updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});






app.get("/allHoldings", async (req, res) => {
  let allHolding = await HoldingsModel.find({});
  res.json(allHolding);
});

app.get("/allPositions", async (req, res) => {
  let allPosition = await PositionsModel.find({});
  res.json(allPosition);
});

app.post("/newOrder", async (req, res) => {
  const { name, price, qty, mode } = req.body;

  try {
    // === 1. Calculate percent change & isDown ===
    const lastOrder = await OrdersModel.findOne({ name }).sort({ _id: -1 });

    let percent = "0%";
    let isDown = false;

    if (lastOrder) {
      const prevPrice = lastOrder.price;
      const diff = price - prevPrice;
      const change = ((diff / prevPrice) * 100).toFixed(2);
      percent = `${Math.abs(change)}%`;
      isDown = diff < 0;
    }

    // === 2. Save order ===
    const newOrder = new OrdersModel({
      name,
      price,
      qty,
      percent,
      isDown,
      mode, // <- include mode in OrdersModel
    });

    await newOrder.save();

    // === 3. Update Holdings ===
    let holding = await HoldingsModel.findOne({ name });

    if (mode === "BUY") {
      if (!holding) {
        // Create new holding
        holding = new HoldingsModel({
          name,
          qty,
          avg: price,
          price,
          net: "0%",
          day: percent,
        });
      } else {
        const oldQty = holding.qty;
        const oldAvg = holding.avg;
        const totalQty = oldQty + Number(qty);
        const newAvg = ((oldQty * oldAvg + qty * price) / totalQty).toFixed(2);

        holding.qty = totalQty;
        holding.avg = parseFloat(newAvg);
        holding.price = price;

        const pnl = ((price - newAvg) * totalQty).toFixed(2);
        const netChg = (((price - newAvg) / newAvg) * 100).toFixed(2);

        holding.net = `${pnl}`;
        holding.day = `${netChg}%`;
      }

      await holding.save();
    } else if (mode === "SELL") {
      if (!holding || holding.qty < qty) {
        return res.status(400).json({ error: "Not enough quantity to sell" });
      }

      holding.qty -= Number(qty);
      holding.price = price;

      if (holding.qty === 0) {
        await HoldingsModel.deleteOne({ name });
      } else {
        const pnl = ((price - holding.avg) * holding.qty).toFixed(2);
        const netChg = (((price - holding.avg) / holding.avg) * 100).toFixed(2);

        holding.net = `${pnl}`;
        holding.day = `${netChg}%`;

        await holding.save();
      }
    }

    res.status(200).json({
      message: "Order saved & holdings updated",
      order: newOrder,
      holding,
    });
  } catch (error) {
    console.error("Error in /newOrder:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/orders", async (req, res) => {
  let allOrder = await OrdersModel.find({});
  res.json(allOrder);
});

app.post("/sellOrder", async (req, res) => {
  const { name, qty, price } = req.body;

  try {
    const holding = await HoldingsModel.findOne({ name });

    if (!holding || holding.qty < qty) {
      return res.status(400).json({ message: "Not enough quantity to sell" });
    }

    // 1. Calculate values
    const remainingQty = holding.qty - qty;
    const pnl = ((price - holding.avg) * qty).toFixed(2);
    const netChg = (((price - holding.avg) / holding.avg) * 100).toFixed(2);

    // 2. Update or delete holding
    if (remainingQty === 0) {
      await HoldingsModel.deleteOne({ name });
    } else {
      holding.qty = remainingQty;
      holding.price = price; // LTP update
      holding.net = `${pnl}`;
      holding.day = `${netChg}%`;
      await holding.save();
    }

    // 3. Add to order history
    const newOrder = new OrdersModel({
      name,
      qty,
      price,
      percent: `${netChg}%`,
      isDown: false,
    });
    await newOrder.save();

    res.status(200).json({ message: "Sell order placed", order: newOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sell order failed" });
  }
});

mongoose
  .connect(uri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.listen(PORT, () => {
  console.log("app is listing at 8080");
});
