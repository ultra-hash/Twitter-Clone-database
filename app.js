const express = require("express");
const app = express();
app.use(express.json());

const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

let db = null;
const SECRET = "THE SUPER SECRET";

const initDbAndStartServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server started at port 3000");
    });
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

initDbAndStartServer();

// password length verifier
const passwordLengthValidator = (request, response, next) => {
  if (request.body.password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    next();
  }
};

// JWT Verifier
const jwtAuthenticator = async (request, response, next) => {
  let jwtToken = request.headers["authorization"];
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = jwtToken.split(" ")[1];
    await jwt.verify(jwtToken, SECRET, async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        // console.log(payLoad);
        request.user_id = payLoad.user_id;
        // console.log(request);
        next();
      }
    });
  }
};

// user register
app.post("/register/", passwordLengthValidator, async (request, response) => {
  let { username, password, name, gender } = request.body;
  const getUser = `
  SELECT 
    * 
  FROM 
    user 
  WHERE 
    username = "${username}";`;
  const userDB = await db.get(getUser);
  if (userDB !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    let hashedPassword = await bcrypt.hash(password, 5);
    const addUser = `
      INSERT INTO 
        user (name, username, password, gender)
      VALUES 
        (
            "${name}",
            "${username}",
            "${hashedPassword}",
            "${gender}"
        );`;
    const dbResponse = await db.run(addUser);
    response.send("User created successfully");
  }
});

// user login
app.post("/login/", passwordLengthValidator, async (request, response) => {
  let { username, password } = request.body;
  const getUser = `
  SELECT 
    * 
  FROM 
    user 
  WHERE 
    username = "${username}";`;
  const userDB = await db.get(getUser);
  //   console.log(userDB);
  if (userDB === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let isPasswordSame = await bcrypt.compare(password, userDB.password);
    if (isPasswordSame) {
      let payLoad = { user_id: userDB.user_id };
      let jwtToken = await jwt.sign(payLoad, SECRET);
      response.send({ jwtToken });
      //   console.log(jwtToken);
      //   console.log(payLoad);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// user tweets feed
app.get("/user/tweets/feed/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  const getTweets = `
      SELECT 
      (SELECT username FROM user WHERE user_id = tweet.user_id) as username,
        tweet.tweet as tweet,
        tweet.date_time as dateTime 
      FROM 
        follower left JOIN tweet ON tweet.user_id = following_user_id    
      WHERE 
        follower_user_id = ${user_id}
      ORDER BY 
        tweet.date_time DESC
      LIMIT 4;`;
  const tweetsList = await db.all(getTweets);
  response.send(tweetsList);
});

// user following list
app.get("/user/following/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  const getFollowingNamesList = `
      SELECT 
        user.name as name
      FROM 
        follower INNER JOIN user on follower.following_user_id = user.user_id
      WHERE 
        follower_user_id = ${user_id};`;
  const followingList = await db.all(getFollowingNamesList);
  response.send(followingList);
});

// user following list
app.get("/user/followers/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  const getFollowersNamesList = `
      SELECT 
        user.name as name
      FROM 
        follower INNER JOIN user on follower.follower_user_id = user.user_id
      WHERE 
        following_user_id = ${user_id};`;
  const followersList = await db.all(getFollowersNamesList);
  response.send(followersList);
});

// get tweet details
app.get("/tweets/:tweetId/", jwtAuthenticator, async (request, response) => {
  let { tweetId } = request.params;
  const user_id = request.user_id;
  const getTweet = `
      SELECT 
        tweet,
        (SELECT COUNT(*) FROM like WHERE tweet_id = ${tweetId}) as likes,
        (SELECT COUNT(*) FROM reply WHERE tweet_id = ${tweetId}) as replies,
        date_time as dateTime,
        user_id
      FROM 
        tweet
      WHERE 
        tweet_id = ${tweetId};`;
  let tweetWithUserId = await db.get(getTweet);

  const getFollowingIdsList = `
      SELECT 
        user.user_id as user_id
      FROM 
        follower INNER JOIN user on follower.following_user_id = user.user_id
      WHERE 
        follower_user_id = ${user_id};`;
  const followingIdsList = await db.all(getFollowingIdsList);
  //   console.log(followingIdsList);
  //   console.log(tweet);

  if (followingIdsList.find((obj) => obj.user_id === tweetWithUserId.user_id)) {
    let { tweet, likes, replies, dateTime } = tweetWithUserId;
    response.send({ tweet, likes, replies, dateTime });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  jwtAuthenticator,
  async (request, response) => {
    let { tweetId } = request.params;
    const user_id = request.user_id;

    const getTweet = `
      SELECT 
        user_id
      FROM 
        tweet
      WHERE 
        tweet_id = ${tweetId};`;
    let tweetedUserId = await db.get(getTweet);
    // console.log(tweetedUserId);
    const getLikedUsernames = `
    SELECT 
        username
    FROM 
        like NATURAL JOIN user
    WHERE 
        tweet_id = ${tweetId};`;
    const listOfNamesOfTweet = await db.all(getLikedUsernames);
    // console.log(listOfNamesOfTweet);
    const getFollowingUserIds = `
    SELECT following_user_id as user_id 
    FROM follower 
    WHERE follower_user_id = ${user_id}`;
    const listOfFollowingUserId = await db.all(getFollowingUserIds);
    // console.log(listOfFollowingUserId);
    if (
      listOfFollowingUserId.find((obj) => obj.user_id === tweetedUserId.user_id)
    ) {
      response.send({ likes: listOfNamesOfTweet.map((obj) => obj.username) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get all reply's with name for a specific tweet
app.get(
  "/tweets/:tweetId/replies/",
  jwtAuthenticator,
  async (request, response) => {
    let { tweetId } = request.params;
    const user_id = request.user_id;

    const getTweet = `
      SELECT 
        user_id
      FROM 
        tweet
      WHERE 
        tweet_id = ${tweetId};`;
    let tweetedUserId = await db.get(getTweet);
    // console.log(tweetedUserId);
    const getListOfReplies = `
    SELECT 
        name,
        reply
    FROM 
        reply NATURAL JOIN user
    WHERE 
        tweet_id = ${tweetId};`;
    const listOfReplies = await db.all(getListOfReplies);
    // console.log(listOfNamesOfTweet);
    const getFollowingUserIds = `
    SELECT following_user_id as user_id 
    FROM follower 
    WHERE follower_user_id = ${user_id}`;
    const listOfFollowingUserId = await db.all(getFollowingUserIds);
    // console.log(listOfFollowingUserId);
    if (
      listOfFollowingUserId.find((obj) => obj.user_id === tweetedUserId.user_id)
    ) {
      response.send({ replies: listOfReplies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// Return a list of all tweets of the user
app.get("/user/tweets/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  const getListOfMyTweets = `
  SELECT 
  tweet,
  (
      SELECT COUNT(*) 
      FROM 
          like 
      WHERE 
          like.tweet_id = tweet.tweet_id
  ) as likes,
  (
      SELECT COUNT(*) 
      FROM 
        reply
      WHERE 
        reply.tweet_id = tweet.tweet_id
  ) as replies,
  date_time as dateTime
  FROM tweet 
  WHERE user_id = ${user_id};`;
  const listOfMyTweets = await db.all(getListOfMyTweets);
  response.send(listOfMyTweets);
});

// Create a tweet in the tweet table
app.post("/user/tweets/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  const { tweet } = request.body;
  const addTweet = `
  INSERT INTO
    tweet (tweet, user_id) 
  VALUES 
    (
        "${tweet}",
        "${user_id}"
    );`;
  //   console.log(request.body);
  const dbResponse = await db.run(addTweet);
  //   console.log(dbResponse.lastID);
  response.send("Created a Tweet");
});

// delete tweet if the user is the owner
app.delete("/tweets/:tweetId/", jwtAuthenticator, async (request, response) => {
  const user_id = request.user_id;
  let { tweetId } = request.params;

  const getTweet = `SELECT * FROM tweet where tweet_id = ${tweetId};`;

  const tweet = await db.get(getTweet);
  if (tweet.user_id === user_id) {
    const deleteTweet = `DELETE FROM tweet where tweet_id = ${tweetId};`;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
