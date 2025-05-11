const jwt = require('jsonwebtoken');
const User = require('../models/Users');
const winston = require('winston');

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ msg: 'All fields are required' });
    }
    if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
      return res.status(400).json({ msg: 'Username must be 3-20 alphanumeric characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ msg: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    
    user = new User({
      username,
      email,
      password
    });
    
    await user.save();
    
    const payload = {
      user: {
        id: user.id
      }
    };
    
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' },
      (err, token) => {
        if (err) {
          logger.error('JWT signing error:', err);
          throw err;
        }
        res.json({ token, user: { id: user.id, username: user.username, rating: user.rating } });
      }
    );
  } catch (err) {
    logger.error('Registration error:', err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ msg: 'All fields are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ msg: 'Invalid email format' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    
    const payload = {
      user: {
        id: user.id
      }
    };
    
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' },
      (err, token) => {
        if (err) {
          logger.error('JWT signing error:', err);
          throw err;
        }
        res.json({ token, user: { id: user.id, username: user.username, rating: user.rating } });
      }
    );
  } catch (err) {
    logger.error('Login error:', err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};