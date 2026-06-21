const express = require("express");
const controller = require("../controllers/membership.controller");

const router = express.Router();

router.get("/", controller.renderHome);
router.get("/health", (req, res) => res.json({ status: "ok", service: "user-membership" }));

router.post("/members/register", controller.registerMember);
router.post("/buyers/register", controller.registerBuyer);
router.post("/login", controller.login);

router.get("/api/members", controller.listMembers);
router.get("/api/buyers", controller.listBuyers);
router.get("/api/stats", controller.stats);

module.exports = router;
