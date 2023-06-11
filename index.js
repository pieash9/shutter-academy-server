const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

//? validate JWT
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  //token verify
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fiktc6e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const classCollection = client.db("shutterAcademyDb").collection("classes");
    const userCollection = client.db("shutterAcademyDb").collection("users");
    const paymentCollection = client
      .db("shutterAcademyDb")
      .collection("payments");
    const selectedClassCollection = client
      .db("shutterAcademyDb")
      .collection("selectedClasses");

    //generate client secret
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = parseFloat(price) * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    //generate JWT token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    //?payment
    app.post("/payment", verifyJWT, async (req, res) => {
      const paymentInfo = req.body;
      const result = await paymentCollection.insertOne(paymentInfo);
      res.send(result);
    });

    //get payment complete(enrolled) classes for a user
    app.get("/payment/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { "studentInfo.email": email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    //?user
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // get data from user role instructor
    app.get("/instructors", async (req, res) => {
      const filter = { role: { $eq: "instructor" } };
      const result = await userCollection.find(filter).toArray();
      res.send(result);
    });

    //? class create by instructor
    app.post("/classes", verifyJWT, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    // manage class seat when student get enrolled
    app.patch("/classes/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      // Query the document to retrieve the current value of availableSeats
      const classData = await classCollection.findOne(query);
      const availableSeats = classData.availableSeats;
      const totalEnrolled = classData.totalEnrolled;

      const updateDoc = {
        $set: {
          availableSeats: parseInt(availableSeats) - 1,
          totalEnrolled: parseInt(totalEnrolled) + 1,
        },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //manage class status by admin
    app.patch("/updateClassStatus/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { status } = req.body;
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //class feedback add  by admin
    app.put("/classFeedback/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const { feedback } = req.body;
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    //update a class
    app.patch("/updateClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const classData = req.body;

      const updateDoc = {
        $set: {
          ...classData,
        },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //get all class
    app.get("/classes", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });
    //get all approved class
    app.get("/approvedClasses", async (req, res) => {
      const filter = { status: { $eq: "approved" } };
      const result = await classCollection.find(filter).toArray();
      res.send(result);
    });

    //get class for a instructor
    app.get("/instructorClasses/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { instructorEmail: email };
      const result = await classCollection.find(filter).toArray();
      res.send(result);
    });

    //? Selected classes
    app.post("/selectedClasses", verifyJWT, async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedClassCollection.insertOne(selectedClass);
      res.send(result);
    });
    // get selected classes for a student
    app.get("/selectedClasses/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { "studentInfo.email": email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    // get a selected classes for a student by id
    app.get("/selectedAClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.findOne(query);
      res.send(result);
    });

    //delete selected class for a student
    app.delete("/selectedClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Shutter academy is running");
});
app.listen(port, () => {
  console.log("Shutter academy is running at port", port);
});
