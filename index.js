const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8000;

// middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nxaiqcz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    //collections
    const userCollection = client.db("RoyalBook").collection("users");
    const categoriesCollection = client
      .db("RoyalBook")
      .collection("categories");
    const booksCollection = client.db("RoyalBook").collection("books");
    const bookingsCollection = client.db("RoyalBook").collection("bookings");
    const paymentsCollection = client.db("RoyalBook").collection("payments");
    const reportCollection = client.db("RoyalBook").collection("report-books");

    // Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user input
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      console.log(result);
      res.send({ result, token });
    });

    //get user role
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    //categories
    app.get("/categories", async (req, res) => {
      const query = {};
      const cursor = categoriesCollection.find(query);
      const categories = await cursor.toArray();
      res.send(categories);
    });

    //add product
    app.post("/products", verifyJWT, async (req, res) => {
      const product = req.body;
      // console.log(home);
      const result = await booksCollection.insertOne(product);
      res.send(result);
    });

    //delete product for seller
    app.delete("/product/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await booksCollection.deleteOne(query);
      res.send(result);
    });

    // Get All product for sellers
    app.get("/products/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = {
        "seller.email": email,
      };
      const cursor = booksCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    //get sellers
    app.get("/sellers", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: "seller" };
      const cursor = userCollection.find(query);
      const users = await cursor.toArray();
      res.send(users);
    });

    //get buyers
    app.get("/buyers", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: "user" };
      const cursor = userCollection.find(query);
      const users = await cursor.toArray();
      res.send(users);
    });

    //get books by categories
    app.get("/categories/:name", async (req, res) => {
      const name = req.params.name;
      const query = { book_category: name, sold: false, advertise: true };
      const cursor = booksCollection.find(query);
      const books = await cursor.toArray();
      res.send(books);
    });

    //get books details
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const book = await booksCollection.findOne(query);
      res.send(book);
    });

    //add booking
    app.post("/booking", verifyJWT, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    //get all bookings my user email
    app.get("/bookings/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = {
        user_email: email,
      };
      const cursor = bookingsCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    //get booking by id
    app.get("/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    //payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const price = req.body.price;
      console.log(price);
      const amount = parseFloat(price) * 100;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.log(err);
      }
    });

    //save payment
    app.put("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookId;
      const filter = { bookId: id };
      const filter2 = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transectionId: payment.transectionId,
        },
      };
      const updatedDoc2 = {
        $set: {
          sold: true,
        },
      };
      const updatedResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      const updateResult2 = await booksCollection.updateOne(
        filter2,
        updatedDoc2
      );
      res.send(result);
    });

    //report book
    app.post("/reportbook", verifyJWT, async (req, res) => {
      const product = req.body;
      const result = await reportCollection.insertOne(product);
      res.send(result);
    });

    //get reported book
    app.get("/reportbook", async (req, res) => {
      const query = {};
      const cursor = reportCollection.find(query);
      const reportBooks = await cursor.toArray();
      res.send(reportBooks);
    });

    //delete reported book data
    app.delete("/reportBook/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const filter = { reportBookId: id };
      const result = await booksCollection.deleteOne(query);
      const update = await reportCollection.deleteOne(filter);
      res.send(result);
    });

    //make verify
    app.put("/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          verify: true,
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //advertise control
    app.put("/advertise/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const query = { _id: ObjectId(id) };
      const book = await booksCollection.findOne(query);
      const options = { upsert: true };

      let updatedDoc;

      if (book.advertise === true) {
        updatedDoc = {
          $set: {
            advertise: false,
          },
        };
      } else {
        updatedDoc = {
          $set: {
            advertise: true,
          },
        };
      }
      const result = await booksCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //delete user
    app.delete(
      "/admin-delete/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: ObjectId(id) };
        const result = await userCollection.deleteOne(query);
        res.send(result);
      }
    );

    //book-verify
    app.get("/verify-seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("Royal Server is running... in session");
});

app.listen(port, () => {
  console.log(`Royal Server is running...on ${port}`);
});
