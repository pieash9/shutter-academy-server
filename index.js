const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());











app.get("/", (req, res) => {
  res.send("Shutter academy is running");
});
app.listen(port, () => {
  console.log("Shutter academy is running at port", port);
});
