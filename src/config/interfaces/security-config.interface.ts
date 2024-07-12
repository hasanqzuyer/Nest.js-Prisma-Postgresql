export interface ISecurityConfig {
  secretKey: string;
  baseDomain: string;
  appSubdomain: string;
  protocol: string;
  password: {
    bcryptSaltRounds: number;
  };
  jwt: {
    cookieName: string;
    expiresIn: string;
  };
  rateLimit: {
    ttl: number;
    limit: number;
  };
}
