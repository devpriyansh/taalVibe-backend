import db from '../../db/models'

export const isAdmin = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: 'User not found' });
    }

    if (user.role?.toLowerCase() !== 'admin') {
      return res.status(403).json({ status: 403, message: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error) {
    console.error('isAdmin middleware error:', error);
    return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
  }
};
