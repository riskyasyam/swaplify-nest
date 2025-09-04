/**
 * Shared configuration for admin integration tests
 * Ensures unique test data and consistent axios mocking
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface TestConfig {
  timestamp: number;
  adminUser: {
    authSub: string;
    email: string;
    displayName: string;
    role: 'ADMIN';
  };
  testUser: {
    authSub: string;
    email: string;
    displayName: string;
    role: 'USER';
  };
  testPlan: {
    code: string;
    name: string;
    priority: number;
  };
  testFeature: {
    name: string;
    value: string;
    type: 'feature';
    status: 'ACTIVE';
    weight: number;
  };
}

/**
 * Creates a unique test configuration for each test run
 * @param suffix - Additional suffix to ensure uniqueness within the same file
 */
export function createTestConfig(suffix: string = ''): TestConfig {
  const timestamp = Date.now();
  const uniqueId = `${timestamp}_${suffix}_${Math.random().toString(36).substring(7)}`;
  
  return {
    timestamp,
    adminUser: {
      authSub: `admin-test-${uniqueId}`,
      email: `admin-${uniqueId}@primeauth.dev`,
      displayName: `Admin User ${uniqueId}`,
      role: 'ADMIN'
    },
    testUser: {
      authSub: `test-user-${uniqueId}`,
      email: `test-${uniqueId}@example.com`,
      displayName: `Test User ${uniqueId}`,
      role: 'USER'
    },
    testPlan: {
      code: `TEST_PLAN_${uniqueId}`,
      name: `Test Plan ${uniqueId}`,
      priority: 99
    },
    testFeature: {
      name: `test_feature_${uniqueId}`,
      value: 'test_value',
      type: 'feature',
      status: 'ACTIVE',
      weight: 1
    }
  };
}

/**
 * Sets up axios mocking for admin tests
 */
export function setupAxiosMocking() {
  // Mock axios for PrimeAuth validation
  jest.mock('axios', () => ({
    post: jest.fn().mockImplementation((url, data) => {
      console.log('🔍 Axios POST called:', { url, body: data });
      
      if (url.includes('/auth/validate') && data.token === 'mock_admin_token_for_test') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            user: {
              sub: 'admin-test-user',
              email: 'admin@primeauth.dev'
            }
          }
        });
      }
      
      return Promise.reject({ response: { status: 401, data: { error: 'Unauthorized' } } });
    }),
    
    get: jest.fn().mockImplementation((url, config) => {
      console.log('🔍 Axios GET called:', { url });
      
      if (url.includes('/users/me') && config?.headers?.Authorization?.includes('mock_admin_token_for_test')) {
        return Promise.resolve({
          status: 200,
          data: {
            sub: 'admin-test-user',
            email: 'admin@primeauth.dev',
            name: 'Admin User',
            role: 'admin'
          }
        });
      }
      
      return Promise.reject({ response: { status: 401, data: { error: 'Unauthorized' } } });
    })
  }));
}

/**
 * Creates admin user in database
 */
export async function createAdminUser(config: TestConfig) {
  return await prisma.user.upsert({
    where: { authSub: config.adminUser.authSub },
    create: config.adminUser,
    update: config.adminUser
  });
}

/**
 * Creates test user in database
 */
export async function createTestUser(config: TestConfig) {
  return await prisma.user.create({
    data: config.testUser
  });
}

/**
 * Standard admin headers for requests
 */
export const getAdminHeaders = () => ({
  'Authorization': 'Bearer mock_admin_token_for_test',
  'Content-Type': 'application/json'
});

/**
 * Clean up test data
 */
export async function cleanupTestData(config: TestConfig) {
  try {
    // Delete users created in this test
    await prisma.user.deleteMany({
      where: {
        OR: [
          { authSub: config.adminUser.authSub },
          { authSub: config.testUser.authSub }
        ]
      }
    });
    
    // Delete test plans
    await prisma.plan.deleteMany({
      where: { code: { contains: config.timestamp.toString() } }
    });
    
    // Delete test features
    await prisma.feature.deleteMany({
      where: { name: { contains: config.timestamp.toString() } }
    });
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }
}
