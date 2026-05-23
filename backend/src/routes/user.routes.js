import express from 'express';
import {
    getUserProfile,
    updateProfile,
    followUser,
    unfollowUser,
} from '../controllers/user.controller.js';
import { protect } from '../middleware/authMiddleware.js';
import validateRequest from '../middleware/validateRequest.js';
import { updateProfileValidator } from '../validators/user.validators.js';

const router = express.Router();

// Public route to view any user's profile
router.get('/:username', getUserProfile);

// Protected routes
router.put('/profile', protect, updateProfileValidator, validateRequest, updateProfile);
router.post('/:username/follow', protect, followUser);
router.delete('/:username/follow', protect, unfollowUser);

export default router;
