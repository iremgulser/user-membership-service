const membershipService = require("../domain/membership.service");

async function renderHome(req, res, next) {
  try {
    const stats = await membershipService.getStats();
    res.render("index", { stats, error: null });
  } catch (error) {
    next(error);
  }
}

async function registerMember(req, res) {
  try {
    const { memberId, event } = await membershipService.registerMember(req.body || {});
    res.status(201).json({ memberId, published: event });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function registerBuyer(req, res) {
  try {
    const { buyerId, event } = await membershipService.registerBuyer(req.body || {});
    res.status(201).json({ buyerId, published: event });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function login(req, res) {
  try {
    const result = await membershipService.login(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function listMembers(req, res, next) {
  try {
    res.json(await membershipService.listMembers());
  } catch (error) {
    next(error);
  }
}

async function listBuyers(req, res, next) {
  try {
    res.json(await membershipService.listBuyers());
  } catch (error) {
    next(error);
  }
}

async function stats(req, res, next) {
  try {
    res.json(await membershipService.getStats());
  } catch (error) {
    next(error);
  }
}

module.exports = { renderHome, registerMember, registerBuyer, login, listMembers, listBuyers, stats };
