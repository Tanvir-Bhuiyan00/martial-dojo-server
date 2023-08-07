const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_KEY);
const port = process.env.PORT || 5000;

//* middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hinjtmc.mongodb.net/?retryWrites=true&w=majority`;

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

    const usersCollection = client.db("martialDb").collection("users");
    const classesCollection = client.db("martialDb").collection("classes");
    const selectedClassCollection = client
      .db("martialDb")
      .collection("selectedClasses");
    const paymentCollection = client.db("martialDb").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // verify admin and instructor
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    //* users api
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/instructor", async (req, res) => {
      const instructors = await usersCollection
        .find({ role: "instructor" })
        .toArray();
      res.send(instructors);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    // classes api
    app.get("/classes", verifyJWT, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });
    app.get("/classes/approved", async (req, res) => {
      const approvedClasses = await classesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(approvedClasses);
    });

    app.get("/api/classes/approved/dsc", async (req, res) => {
      try {
        const options = {
          sort: { enrolled: -1 },
        };
        const approvedClass = await classesCollection
          .find({ status: "approved" }, options)
          .limit(6)
          .toArray();
        res.send(approvedClass);
      } catch (error) {
        console.error("Error retrieving approved classes:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.patch("/classes/feedback/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: req.body.feedback,
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/admin/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: req.body.status,
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const newClasses = req.body;
      const result = await classesCollection.insertOne(newClasses);
      res.send(result);
    });

    app.get("/classes/instructor", async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = { instructorEmail: req.query.email };
      }

      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // selected Classes api
    app.get("/selectedClasses", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/selectedClasses", async (req, res) => {
      const item = req.body;
      const result = await selectedClassCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/selectedClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // payment api
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      console.log(payment);
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.course.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await selectedClassCollection.deleteMany(query);
      const updateResult = await classesCollection.updateOne(
        { _id: new ObjectId(payment.course[0]) },
        { $inc: { availableSeats: -1, enrolled: 1 } }
      );
      res.send({ insertResult, deleteResult });
    });

    app.get("/enrolled", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const query = { email: email };
      const enrolledCourses = await paymentCollection.find(query).toArray();
      res.send(enrolledCourses);
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
  res.send("DOJO is Opened");
});

app.listen(port, () => {
  console.log(`Martial Dojo is opened on port ${port}`);
});
