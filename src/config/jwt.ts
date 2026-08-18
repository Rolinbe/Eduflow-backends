export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'default_secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
  expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as any,
  refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
};
