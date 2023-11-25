// Express Import
const express = require("express");
const { check, validationResult } = require("express-validator");
const router = express.Router();

const auth = require("../../middleware/auth");

const ChallengeOfTheWeek = require("../../models/ChallengeOfTheWeek");
const User = require("../../models/User");

// @route   GET api/challengeoftheweek
// @desc    Get current challenge of the week
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    // Test if challenge exists
    let challenge = await ChallengeOfTheWeek.findOne().sort({
      createdAt: "desc",
    });

    if (!challenge)
      return res
        .status(404)
        .json({
          errors: [
            {
              param: "challenge",
              msg: "There is no challenge for this the week.",
            },
          ],
        });

    // Test if user has already submitted answers to this challenge
    const userPoints = challenge.results.find(
      (result) => result.user.toString() === req.userId,
    );

    if (userPoints) {
      // Populate with username and emoji to create respond for frontend
      challenge = await ChallengeOfTheWeek.populate(challenge, {
        path: "results.user",
        select: "username emoji",
        model: "User",
      });

      const leaderboard = challenge.results.sort((a, b) => b.points - a.points);

      const response = {
        _id: challenge._id,
        results: leaderboard.map(({ points, user: { username, emoji } }) => ({
          points,
          username,
          emoji,
        })),
      };

      // Return leaderboard
      return res.json(response);
    }

    // Return challenge
    res.json({ _id: challenge._id, questions: challenge.questions });

    // Return error if there is
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/challengeoftheweek/leaderboard
// @desc    Get leaderboard if current challenge of the week
// @access  Private
router.get("/leaderboard", auth, async (req, res) => {
  try {
    // Test if challenge exists
    let challenge = await ChallengeOfTheWeek.findOne()
      .sort({ createdAt: "desc" })
      .select("results")
      .populate("results.user", "username emoji");

    if (!challenge)
      return res
        .status(404)
        .json({
          errors: [
            {
              param: "challenge",
              msg: "There is no challenge for this the week.",
            },
          ],
        });

    const leaderboard = challenge.results.sort((a, b) => b.points - a.points);

    const response = {
      _id: challenge._id,
      results: leaderboard.map(({ points, user: { username, emoji } }) => ({
        points,
        username,
        emoji,
      })),
    };

    // Return leaderboard
    res.json(response);

    // Return challenge
    res.json(leaderboard);

    // Return error if there is
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST api/challengeoftheweek
// @desc    Submit answers to current challenge of the week
// @access  Private
router.post(
  "/",
  [
    auth,
    [
      check("answers", "Please provide answers to this challenge.")
        .exists()
        .isArray(),
    ],
  ],
  async (req, res) => {
    // Check for errors
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors
        .array()
        .map(({ param, msg }) => ({ param, msg }));
      return res.status(400).json({ errors });
    }

    const { answers } = req.body;

    try {
      // Get latest challenge of the week
      let challenge = await ChallengeOfTheWeek.findOne()
        .sort({ createdAt: "desc" })
        .populate();
      // .populate('results.user', 'username emoji')

      // Check challenge exists
      if (!challenge)
        return res.status(404).json({
          errors: [
            {
              param: "challenge",
              msg: "There is no challenge for this the week.",
            },
          ],
        });

      // Test if user has already submitted answers to this challenge
      const userPoints = challenge.results.find(
        (result) => result.user.toString() === req.userId,
      );
      if (userPoints)
        return res.status(400).json({
          errors: [
            {
              param: "userId",
              msg: "User already submitted answers to this challenge.",
            },
          ],
        });

      // Test if answers array is in correct format
      if (answers.length !== challenge.questions.length)
        return res
          .status(400)
          .json({
            errors: [
              {
                param: "answers",
                msg: "There are too many or too few answers.",
              },
            ],
          });

      // Calculate result
      const result = answers.map((answer, index) =>
        answer === challenge.questions[index].answer ? 1 : 0,
      );

      // Count points = correct answers
      const points = result.filter((r) => r).length;

      // Add answers to challenge answers
      challenge.results.push({ user: req.userId, points });

      // Save challenge to database
      await challenge.save();

      // Calculate and add Points to User; 10 Points for every correct answer
      const user = await User.findById(req.userId);
      user.points += points * 10;
      user.save();

      // Populate with username and emoji to create respond for frontend
      challenge = await ChallengeOfTheWeek.populate(challenge, {
        path: "results.user",
        select: "username emoji",
        model: "User",
      });

      const leaderboard = challenge.results.sort((a, b) => b.points - a.points);

      const response = {
        _id: challenge._id,
        results: leaderboard.map(({ points, user: { username, emoji } }) => ({
          points,
          username,
          emoji,
        })),
      };

      // Return leaderboard
      res.json(response);

      // Return error if there is
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  },
);

module.exports = router;
