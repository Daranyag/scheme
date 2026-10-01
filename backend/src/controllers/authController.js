const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { TARGET_STATE } = require('../config/constants');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, age, category } = req.body;
    
    if (req.body.state && req.body.state !== TARGET_STATE) {
      return res.status(400).json({ success: false, message: 'Only Tamil Nadu users are supported.' });
    }
    const state = TARGET_STATE;
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      age,
      state,
      category,
    });

    if (user) {
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          token: generateToken(user._id),
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            age: user.age,
            state: user.state,
            category: user.category,
            gender: user.gender,
            income: user.income,
            occupation: user.occupation,
            disabilityStatus: user.disabilityStatus
          }
        }
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token: generateToken(user._id),
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            age: user.age,
            state: user.state,
            category: user.category,
            gender: user.gender,
            income: user.income,
            occupation: user.occupation,
            disabilityStatus: user.disabilityStatus
          }
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json({
        success: true,
        message: 'User retrieved successfully',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            age: user.age,
            state: user.state,
            category: user.category,
            gender: user.gender,
            income: user.income,
            occupation: user.occupation,
            disabilityStatus: user.disabilityStatus
          }
        }
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      if (req.body.state && req.body.state !== TARGET_STATE) {
        return res.status(400).json({ success: false, message: 'State change not allowed. Only Tamil Nadu is supported.' });
      }

      user.name = req.body.name || user.name;
      user.age = req.body.age || user.age;
      user.state = TARGET_STATE;
      user.category = req.body.category || user.category;
      user.gender = req.body.gender || user.gender;
      if (req.body.income !== undefined) user.income = req.body.income;
      user.occupation = req.body.occupation || user.occupation;
      user.disabilityStatus = req.body.disabilityStatus || user.disabilityStatus;

      const updatedUser = await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            age: updatedUser.age,
            state: updatedUser.state,
            category: updatedUser.category,
            gender: updatedUser.gender,
            income: updatedUser.income,
            occupation: updatedUser.occupation,
            disabilityStatus: updatedUser.disabilityStatus
          }
        }
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { registerUser, loginUser, getMe, updateProfile };
