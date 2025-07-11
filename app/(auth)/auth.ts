import { compare } from 'bcrypt-ts';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { getUser, updateUserGoogleTokens } from '@/lib/db/queries';
import { authConfig } from './auth.config';
import { DUMMY_PASSWORD } from '@/lib/constants';
import type { DefaultJWT } from 'next-auth/jwt';

export type UserType = 'regular';

// Extend the types for NextAuth
declare module 'next-auth' {
  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
  
  interface Session {
    user?: {
      id: string;
      type: UserType;
    } & DefaultSession['user'];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          // Add access_type=offline to get a refresh token
          access_type: 'offline',
          prompt: 'consent',
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          type: 'regular', // All Google users are treated as 'regular' users
        };
      },
    }),
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) return null;

        return { ...user, type: 'regular' };
      },
    }),

  ],
  callbacks: {
    
    async jwt({ token, user, account, trigger }) {
      // When signing in, copy user details to token
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
      }
      
      // If this is a Google sign-in, save the tokens to the database
      if (account && account.provider === 'google' && account.access_token) {
        console.log('Google account detected, saving tokens to database');
        console.log('Account:', { 
          provider: account.provider,
          hasAccessToken: !!account.access_token,
          hasRefreshToken: !!account.refresh_token,
          expiresAt: account.expires_at
        });
        
        // Store tokens in the token object for session access
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
        
        // We need to find the user by email to get the correct database ID
        if (account.access_token && user?.email) {
          try {
            // Find the user by email
            const users = await getUser(user.email);
            
            if (users.length > 0) {
              const dbUser = users[0];
              console.log(`Found user in database with email ${user.email}, ID: ${dbUser.id}`);
              
              // Calculate expiry time in milliseconds
              const expiryTime = account.expires_at ? account.expires_at * 1000 : undefined;
              console.log('Token expiry time:', expiryTime ? new Date(expiryTime).toISOString() : 'undefined');
              
              // Use the database user ID, not the token ID
              const updateResult = await updateUserGoogleTokens({
                userId: dbUser.id,
                accessToken: account.access_token,
                refreshToken: account.refresh_token,
                expiryTime
              });
              
              console.log('Token update result:', updateResult);
              
              // Update the token ID to match the database ID
              token.id = dbUser.id;
              
              // Force a database commit by performing another query
              const verifyUser = await getUser(user.email);
              if (verifyUser.length > 0) {
                console.log('User verified after token update:', {
                  id: verifyUser[0].id,
                  email: verifyUser[0].email,
                  hasGoogleAccessToken: !!verifyUser[0].googleAccessToken
                });
              }
              
              console.log('Successfully saved Google tokens to database for user ID:', dbUser.id);
            } else {
              console.error(`No user found in database with email ${user.email}`);
            }
          } catch (error) {
            console.error('Error saving Google tokens to database:', error);
          }
        } else {
          console.error('Missing required data to save tokens:', { 
            hasUserEmail: !!user?.email, 
            hasAccessToken: !!account.access_token 
          });
        }
      }
      
      // Handle token refresh if needed
      const now = Date.now();
      if (token.accessTokenExpires && now > token.accessTokenExpires) {
        console.log('Access token expired, should refresh');
        // In a production app, you would implement token refresh here
        // For now, we'll just log the expiration
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Ensure we're using the correct user ID from the token
        session.user.id = token.id;
        session.user.type = token.type;
        
        // Log the user ID for debugging
        console.log(`Session user ID: ${session.user.id}, email: ${session.user.email}`);
      }
      
      // Add the Google tokens to the session
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.accessTokenExpires = token.accessTokenExpires;
      
      // Log session token information for debugging
      console.log('Session tokens:', {
        hasAccessToken: !!session.accessToken,
        hasRefreshToken: !!session.refreshToken,
        accessTokenExpires: session.accessTokenExpires
      });

      return session;
    },
  },
});
