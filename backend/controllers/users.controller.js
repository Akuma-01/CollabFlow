const userService = require("../services/users.service");

// GET
const getUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getUsers,
};
