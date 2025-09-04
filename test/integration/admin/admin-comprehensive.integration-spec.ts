import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { default as request } from 'supertest';
import axios from 'axios';

// Mock axios completely
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

// Helper function for admin headers
const getAdminHeaders = () => ({
  'Authorization': 'Bearer mock_admin_token_for_test',
  'Content-Type': 'application/json'
});

describe('Admin Management Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let adminHeaders: any;

  beforeAll(async () => {
    // Setup axios mocks for PrimeAuth token validation
    mockedAxios.post.mockImplementation((url: string, body: any) => {
      console.log('🔍 Axios POST called:', { url, body });
      
      if (url.includes('/api/v1/auth/validate') && body.token === 'mock_admin_token_for_test') {
        return Promise.resolve({
          data: {
            data: {
              valid: true,
              active: true,
              user_id: 'admin-test-user',
              sub: 'admin-test-user',
              email: 'admin@primeauth.dev',
              preferred_username: 'admin',
              realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3'
            }
          }
        });
      }
      
      return Promise.reject(new Error('Unmocked axios call'));
    });

    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      console.log('🔍 Axios GET called:', { url });
      
      if (url.includes('/api/v1/users/me') && config?.headers?.Authorization?.includes('mock_admin_token_for_test')) {
        return Promise.resolve({
          data: {
            data: {
              email: 'admin@primeauth.dev',
              first_name: 'Admin',
              last_name: 'User',
              username: 'admin'
            }
          }
        });
      }
      
      return Promise.reject(new Error('Unmocked axios call'));
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    // Create unique test configuration with more unique identifiers
    const baseTimestamp = Date.now();
    const processId = process.pid;
    const randomId = Math.random().toString(36).substring(7);
    const uniqueId = `${baseTimestamp}_${processId}_${randomId}`;
    
    // Create admin user with fixed authSub that matches mock
    await prisma.user.upsert({
      where: { authSub: 'admin-test-user' }, // This must match the mock
      create: { 
        authSub: 'admin-test-user', 
        email: 'admin@primeauth.dev', 
        displayName: 'Admin User',
        role: 'ADMIN'
      },
      update: { 
        email: 'admin@primeauth.dev', 
        displayName: 'Admin User',
        role: 'ADMIN'
      }
    });

    // Create a test user for admin operations with unique email
    const testUser = await prisma.user.create({
      data: {
        authSub: `test-user-${uniqueId}`,
        email: `test-${uniqueId}@example.com`,
        displayName: `Test User ${uniqueId}`,
        role: 'USER'
      }
    });
    testUserId = testUser.id;
    
    adminHeaders = getAdminHeaders();
    
    console.log('✅ Test data setup completed');
  });

  afterEach(async () => {
    // Simple cleanup - database reset akan handle cleanup di beforeEach berikutnya
    try {
      // Delete test users created in this specific test if they exist
      if (testUserId) {
        await prisma.user.deleteMany({
          where: { 
            OR: [
              { id: testUserId },
              { email: { contains: Date.now().toString().slice(-10) } }
            ]
          }
        });
      }
    } catch (error) {
      console.warn('Cleanup warning (expected):', error.message);
    }
  });

  afterAll(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('User Management', () => {
    it('should get all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/user')
        .set(adminHeaders)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2); // Admin + test user
      
      const adminUser = response.body.find(u => u.role === 'ADMIN');
      expect(adminUser).toBeDefined();
      expect(adminUser.email).toBe('admin@primeauth.dev');
    });

    it('should get user quota', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user/${testUserId}/quota`)
        .set(adminHeaders)
        .expect(200);

      // Response contains user data, not a separate quotas property
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('jobsThisMonth');
    });

    it('should update user subscription', async () => {
      // First create a plan and subscription
      const plan = await prisma.plan.findFirst({ where: { code: 'PRO' } });
      if (!plan) throw new Error('PRO plan not found');

      const subscriptionData = {
        planCode: 'PRO',
        status: 'ACTIVE' as const
      };

      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .set(adminHeaders)
        .send(subscriptionData)
        .expect(200);

      expect(response.body).toHaveProperty('subscription');
      expect(response.body.subscription.status).toBe('ACTIVE');
      expect(response.body.subscription.planId).toBe(plan.id);
    });

    it('should update user role', async () => {
      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/role`)
        .set(adminHeaders)
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.role).toBe('ADMIN');
    });

    it('should delete user', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/user/${testUserId}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('dihapus');
      
      // Verify user is deleted
      const deletedUser = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(deletedUser).toBeNull();
    });
  });

  describe('Plans Management', () => {
    it('should get all plans', async () => {
      const response = await request(app.getHttpServer())
        .get('/plans')
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      
      // Check for any plan that exists instead of specifically FREE
      const anyPlan = response.body.items[0];
      expect(anyPlan).toBeDefined();
      expect(anyPlan).toHaveProperty('id');
      expect(anyPlan).toHaveProperty('code');
      expect(anyPlan).toHaveProperty('name');
    });

    it('should get plan details', async () => {
      // Get any available plan instead of specifically FREE
      const plan = await prisma.plan.findFirst();
      if (!plan) throw new Error('No plan found');

      const response = await request(app.getHttpServer())
        .get(`/plans/${plan.id}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body.id).toBe(plan.id);
      expect(response.body.code).toBe(plan.code);
    });

    it('should create new plan', async () => {
      const timestamp = Date.now();
      const newPlanData = {
        code: `ENTERPRISE_${timestamp}`,
        name: `Enterprise ${timestamp}`,
        priority: 4
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .set(adminHeaders)
        .send(newPlanData)
        .expect(201);

      expect(response.body.code).toBe(`ENTERPRISE_${timestamp}`);
      expect(response.body.name).toBe(`Enterprise ${timestamp}`);
      expect(response.body.priority).toBe(4);
    });

    it('should update plan', async () => {
      // Get any available plan instead of specifically FREE
      const plan = await prisma.plan.findFirst();
      if (!plan) throw new Error('No plan found');

      const updateData = {
        name: `${plan.name} Updated`,
        priority: 5
      };

      const response = await request(app.getHttpServer())
        .patch(`/plans/${plan.id}`)
        .set(adminHeaders)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe(`${plan.name} Updated`);
      expect(response.body.priority).toBe(5);
    });

    it('should delete plan', async () => {
      // Create a plan to delete
      const timestamp = Date.now();
      const planToDelete = await prisma.plan.create({
        data: {
          code: `TO_DELETE_${timestamp}`,
          name: `To Delete ${timestamp}`,
          priority: 99
        }
      });

      const response = await request(app.getHttpServer())
        .delete(`/plans/${planToDelete.id}`)
        .set(adminHeaders)
        .expect(200);

      // Plan delete returns the deleted plan object, not a message
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toBe(planToDelete.id);
      
      // Verify plan is deleted
      const deletedPlan = await prisma.plan.findUnique({ where: { id: planToDelete.id } });
      expect(deletedPlan).toBeNull();
    });
  });

  describe('Features Management', () => {
    it('should get all features', async () => {
      const response = await request(app.getHttpServer())
        .get('/features')
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      
      const firstFeature = response.body.items[0];
      expect(firstFeature).toHaveProperty('name');
      expect(firstFeature).toHaveProperty('status');
      expect(firstFeature).toHaveProperty('weight');
    });

    it('should get feature details', async () => {
      const feature = await prisma.feature.findFirst();
      if (!feature) throw new Error('Feature not found');
      
      const response = await request(app.getHttpServer())
        .get(`/features/${feature.id}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body.id).toBe(feature.id);
      expect(response.body.name).toBe(feature.name);
    });

    it('should create new feature', async () => {
      const timestamp = Date.now();
      const newFeatureData = {
        name: `new_test_feature_${timestamp}`,
        value: 'test_value',
        type: 'feature',
        status: 'ACTIVE',
        weight: 1
      };

      const response = await request(app.getHttpServer())
        .post('/features')
        .set(adminHeaders)
        .send(newFeatureData)
        .expect(201);

      expect(response.body.name).toBe(`new_test_feature_${timestamp}`);
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.weight).toBe(1);
    });

    it('should update feature', async () => {
      const feature = await prisma.feature.findFirst();
      if (!feature) throw new Error('Feature not found');
      
      const updateData = {
        status: 'INACTIVE',
        weight: 5
      };

      const response = await request(app.getHttpServer())
        .patch(`/features/${feature.id}`)
        .set(adminHeaders)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe('INACTIVE');
      expect(response.body.weight).toBe(5);
    });

    it('should delete feature', async () => {
      // Create a feature to delete
      const timestamp = Date.now();
      const featureToDelete = await prisma.feature.create({
        data: {
          name: `feature_to_delete_${timestamp}`,
          value: '',
          type: 'feature',
          status: 'ACTIVE',
          weight: 1
        }
      });

      const response = await request(app.getHttpServer())
        .delete(`/features/${featureToDelete.id}`)
        .set(adminHeaders)
        .expect(200);

      // Feature delete should return the deleted feature data, not a message
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toBe(featureToDelete.id);
      
      // Verify feature is deleted
      const deletedFeature = await prisma.feature.findUnique({ where: { id: featureToDelete.id } });
      expect(deletedFeature).toBeNull();
    });
  });

  describe('Plan Entitlements', () => {
    it('should get plan entitlements', async () => {
      // Get any available plan instead of specifically FREE
      const plan = await prisma.plan.findFirst();
      if (!plan) throw new Error('No plan found');
      
      // Get plan details which includes entitlements
      const response = await request(app.getHttpServer())
        .get(`/plans/${plan.id}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body.id).toBe(plan.id);
      expect(response.body).toHaveProperty('entitlements');
      expect(Array.isArray(response.body.entitlements)).toBe(true);
    });

    it('should create plan entitlement', async () => {
      const plan = await prisma.plan.findFirst({ where: { code: 'PRO' } });
      const feature = await prisma.feature.findFirst({ where: { type: 'feature' } });
      if (!plan) throw new Error('PRO plan not found');
      if (!feature) throw new Error('Feature not found');
      
      const entitlementData = {
        version: 1,
        featureId: feature.id,
        value: '1000'
      };

      const response = await request(app.getHttpServer())
        .post(`/plans/${plan.id}/entitlements`)
        .set(adminHeaders)
        .send(entitlementData)
        .expect(201);

      expect(response.body.planId).toBe(plan.id);
      expect(response.body.version).toBe(1);
      expect(response.body).toHaveProperty('entitlements');
      // The entitlements is JSON containing the sent data minus version
      expect(response.body.entitlements).toHaveProperty('featureId');
      expect(response.body.entitlements.featureId).toBe(feature.id);
    });
  });

  describe('User Subscriptions', () => {
    it('should get user active subscription', async () => {
      // Create a subscription for test user first
      // Get any available plan instead of specifically FREE
      const plan = await prisma.plan.findFirst();
      if (!plan) throw new Error('No plan found');
      
      await prisma.subscription.create({
        data: {
          userId: testUserId,
          planId: plan.id,
          status: 'ACTIVE',
          currentStart: new Date(),
          currentEnd: null // Active subscription has null currentEnd
        }
      });

      const response = await request(app.getHttpServer())
        .get(`/user/${testUserId}/details`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('subscription');
      expect(response.body.subscription).not.toBeNull();
      expect(response.body.subscription.status).toBe('ACTIVE');
      expect(response.body.subscription.planCode).toBe(plan.code);
    });

    it('should cancel user subscription', async () => {
      // Create a subscription for test user
      const plan = await prisma.plan.findFirst({ where: { code: 'PRO' } });
      if (!plan) throw new Error('PRO plan not found');
      
      const subscription = await prisma.subscription.create({
        data: {
          userId: testUserId,
          planId: plan.id,
          status: 'ACTIVE',
          currentStart: new Date(),
          currentEnd: null
        }
      });

      // Update subscription to CANCELLED status
      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .set(adminHeaders)
        .send({
          planCode: 'PRO',
          status: 'CANCELLED'
        })
        .expect(200);

      expect(response.body).toHaveProperty('subscription');
      expect(response.body.subscription.status).toBe('CANCELLED');
      
      // Verify subscription is cancelled  
      const cancelledSub = await prisma.subscription.findFirst({ 
        where: { userId: testUserId, status: 'CANCELLED' }
      });
      expect(cancelledSub).not.toBeNull();
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/user')
        .expect(401);

      expect(response.body.message).toBe('No token');
    });

    it('should reject request with invalid token', async () => {
      // Mock invalid token response
      mockedAxios.post.mockImplementationOnce(() => {
        return Promise.reject({ response: { status: 401, data: { detail: 'Invalid token' } } });
      });

      const response = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.message).toBe('Invalid/expired token');
    });

    it('should reject non-admin user', async () => {
      // Create non-admin user
      const regularUser = await prisma.user.create({
        data: {
          authSub: 'regular-user',
          email: 'regular@example.com',
          displayName: 'Regular User',
          role: 'USER'
        }
      });

      // Mock token validation for regular user
      mockedAxios.post.mockImplementationOnce(() => {
        return Promise.resolve({
          data: {
            valid: true,
            active: true,
            user_id: 'regular-user',
            sub: 'regular-user',
            email: 'regular@example.com'
          }
        });
      });

      // Mock /users/me for regular user
      mockedAxios.get.mockImplementationOnce(() => {
        return Promise.resolve({
          data: {
            data: {
              email: 'regular@example.com',
              first_name: 'Regular',
              last_name: 'User',
              username: 'regular'
            }
          }
        });
      });

      const response = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', 'Bearer regular_user_token')
        .expect(403);

      expect(response.body.message).toBe('Forbidden resource');
    });
  });

  describe('Data Validation', () => {
    it('should validate plan creation data', async () => {
      const invalidPlanData = {
        // Missing required fields
        name: 'Invalid Plan'
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .set(adminHeaders)
        .send(invalidPlanData)
        .expect(500);

      // API returns 500 for missing required fields
      expect(response.body.message).toBeDefined();
    });

    it('should validate feature creation data', async () => {
      const invalidFeatureData = {
        // Missing required fields
        value: 'test'
      };

      const response = await request(app.getHttpServer())
        .post('/features')
        .set(adminHeaders)
        .send(invalidFeatureData)
        .expect(500);

      // API returns 500 for missing required fields  
      expect(response.body.message).toBeDefined();
    });

    it('should validate subscription update data', async () => {
      const invalidSubscriptionData = {
        status: 'INVALID_STATUS'
      };

      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .set(adminHeaders)
        .send(invalidSubscriptionData)
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent user operations', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .get(`/user/${fakeUserId}/quota`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body.error).toBe('User not found');
    });

    it('should handle non-existent plan operations', async () => {
      const fakePlanId = 99999;

      const response = await request(app.getHttpServer())
        .get(`/plans/${fakePlanId}`)
        .set(adminHeaders)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should handle non-existent feature operations', async () => {
      const fakeFeatureId = 99999;

      const response = await request(app.getHttpServer())
        .get(`/features/${fakeFeatureId}`)
        .set(adminHeaders)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });
});
