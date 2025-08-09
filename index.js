const express = require('express');
const cors = require('cors');


//firebase-key
const admin = require("firebase-admin");

//vercel
// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8');
// const serviceAccount = JSON.parse(decoded);

// LocalHost
const serviceAccount = require("./firebase-admin-service-key.json");


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@metleaf.k43zbyg.mongodb.net/?retryWrites=true&w=majority&appName=MetLeaf`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

//firebase-key-lastPart
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// JWT token verify using firebase
const verifyFireBaseToken = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = await admin.auth().verifyIdToken(token); //firebase Documentation
        //console.log('decode token', decode)
        req.decoded = decoded;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('artileaf').collection('users');
        const artifactsCollection = client.db('artileaf').collection('artifacts');

        app.get('/artifacts', async (req, res) => {
            const { searchParams } = req.query;
            let query = {}; // first time search null thakbe.

            if (searchParams) {
                query = {
                    name: {
                        $regex: searchParams,
                        $options: "i" //small letter capital letter handle korar janno
                    }
                }
            }
            const result = await artifactsCollection.find(query).toArray();
            res.send(result);
        })

        //Artifacts with the highest like count. 
        app.get('/artifacts/top-liked', async (req, res) => {

            try {
                const result = await artifactsCollection
                    .aggregate([
                        {
                            $addFields: {
                                likeCount: { $size: { $ifNull: ["$likedBy", []] } }
                            }
                        },
                        {
                            $sort: { likeCount: -1 }
                        }
                    ])
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch top liked artifacts", error });
            }
        });

        app.get('/artifacts/:id',verifyFireBaseToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await artifactsCollection.findOne(query);
            res.send(result);
        })

        app.get('/likedArtifacts/:email', verifyFireBaseToken, async (req, res) => {
            const email = req.params.email;
            // console.log('req Headers', req.headers)
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            try {
                const likedArtifacts = await artifactsCollection.find({ likedBy: email }).toArray();
                res.send(likedArtifacts);
            } catch (err) {
                res.status(500).send({ error: "Something went wrong!" });
            }
        })

        app.get('/myArtifacts/:email', verifyFireBaseToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            try {
                const myArtifacts = await artifactsCollection.find({ adderEmail: email }).toArray();
                res.send(myArtifacts);
            } catch (err) {
                res.status(500).send({ error: "Something went wrong!" });
            }
        })

        app.delete('/artifacts/:id', verifyFireBaseToken, async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) };
            const result = await artifactsCollection.deleteOne(query);
            res.send(result);
        })

        app.put('/updateMyArtifacts/:id', verifyFireBaseToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateArtifact = req.body;
            const updateDoc = {
                $set: updateArtifact
            }
            const result = await artifactsCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const userProfile = req.body;
            // console.log(userProfile);
            const result = await usersCollection.insertOne(userProfile);
            res.send(result);
        })

        app.post('/artifacts', verifyFireBaseToken, async (req, res) => {
            const addArtifact = req.body;
            // console.log(addArtifact);
            const result = await artifactsCollection.insertOne(addArtifact);
            res.send(result);
        })

        //handle like toggle
        app.patch('/like/:id', async (req, res) => {
            const id = req.params.id;
            const email = req.body.email;
            // console.log(req.body)
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const artifacts = await artifactsCollection.findOne(filter);
            // check if the user has already liked the coffee or not
            const alreadyLiked = artifacts?.likedBy.includes(email);
            const updateDoc = alreadyLiked ? {
                $pull: {           //DisLike artifact(Remove email from likedBy array)
                    likedBy: email
                }
            } : {
                $addToSet: {        //Like artifact(Push email to likedBy array)
                    likedBy: email
                }
            }

            const result = await artifactsCollection.updateOne(filter, updateDoc, options);
            res.send({
                message: alreadyLiked ? 'Dislike Successful' : 'Like Successful',
                liked: !alreadyLiked,
            })
        })

        // Send a ping to confirm a successful connection

        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('ArtiLeaf is cooking...');
})

app.listen(port, () => {
    console.log(`ArtiLeaf port server is running on port ${port} `);
})