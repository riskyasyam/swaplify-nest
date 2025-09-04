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

  describe('Admin User Management', () => {
    it('should get all users (GET /user)', async () => {
      const response = await request(app.getHttpServer())
        .get('/user')
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check user structure
      const user = response.body[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('displayName');
      expect(user).toHaveProperty('role');
    });

    it('should update user subscription (PUT /user/:id/subscription)', async () => {
      // Get a valid plan dynamically
      const plan = await prisma.plan.findFirst({ where: { code: 'PRO' } }) || 
                   await prisma.plan.findFirst({ where: { code: 'PREMIUM' } }) ||
                   await prisma.plan.findFirst();
      
      expect(plan).toBeDefined();

      const updateData = {
        plan: plan!.code,
        status: 'ACTIVE'
      };

      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .set(adminHeaders)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('updated');

      // Verify subscription updated in database
      const subscription = await prisma.subscription.findFirst({
        where: { userId: testUserId },
        include: { plan: true }
      });
      expect(subscription).toBeDefined();
      expect(subscription!.plan.code).toBe(plan!.code);
    });

    it('should handle invalid user ID (PUT /user/invalid/subscription)', async () => {
      const updateData = {
        plan: 'PRO',
        status: 'ACTIVE'
      };

      const response = await request(app.getHttpServer())
        .put('/user/invalid-user-id/subscription')
        .set(adminHeaders)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });

    it('should handle invalid plan code (PUT /user/:id/subscription)', async () => {
      const updateData = {
        plan: 'INVALID_PLAN',
        status: 'ACTIVE'
      };

      const response = await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .set(adminHeaders)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid plan');
    });

    it('should require admin authorization (GET /user)', async () => {
      await request(app.getHttpServer())
        .get('/user')
        .expect(401);
    });

    it('should require admin authorization (PUT /user/:id/subscription)', async () => {
      const updateData = {
        plan: 'PRO',
        status: 'ACTIVE'
      };

      await request(app.getHttpServer())
        .put(`/user/${testUserId}/subscription`)
        .send(updateData)
        .expect(401);
    });
  });

  describe('Admin Plan Management', () => {
    it('should get all plans (GET /plans)', async () => {
      const response = await request(app.getHttpServer())
        .get('/plans')
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check plan structure
      const plan = response.body[0];
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('code');
      expect(plan).toHaveProperty('name');
    });

    it('should create a new plan (POST /plans)', async () => {
      const baseTimestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(7);
      
      const newPlan = {
        code: `PLAN_${baseTimestamp}_${uniqueId}`,
        name: `Test Plan ${baseTimestamp}`,
        priority: 99
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .set(adminHeaders)
        .send(newPlan)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.code).toBe(newPlan.code);
      expect(response.body.name).toBe(newPlan.name);
      expect(response.body.priority).toBe(newPlan.priority);

      // Verify plan created in database
      const createdPlan = await prisma.plan.findUnique({
        where: { code: newPlan.code }
      });
      expect(createdPlan).toBeDefined();
      expect(createdPlan!.name).toBe(newPlan.name);
    });

    it('should handle duplicate plan code (POST /plans)', async () => {
      const existingPlan = await prisma.plan.findFirst();
      expect(existingPlan).toBeDefined();

      const duplicatePlan = {
        code: existingPlan!.code,
        name: 'Duplicate Plan',
        priority: 1
      };

      const response = await request(app.getHttpServer())
        .post('/plans')
        .set(adminHeaders)
        .send(duplicatePlan)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('already exists');
    });

    it('should update an existing plan (PUT /plans/:id)', async () => {
      const existingPlan = await prisma.plan.findFirst();
      expect(existingPlan).toBeDefined();

      const updateData = {
        name: `Updated Plan ${Date.now()}`,
        priority: 50
      };

      const response = await request(app.getHttpServer())
        .put(`/plans/${existingPlan!.id}`)
        .set(adminHeaders)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(updateData.name);
      expect(response.body.priority).toBe(updateData.priority);

      // Verify plan updated in database
      const updatedPlan = await prisma.plan.findUnique({
        where: { id: existingPlan!.id }
      });
      expect(updatedPlan!.name).toBe(updateData.name);
      expect(updatedPlan!.priority).toBe(updateData.priority);
    });

    it('should handle invalid plan ID (PUT /plans/999999)', async () => {
      const updateData = {
        name: 'Updated Plan',
        priority: 1
      };

      const response = await request(app.getHttpServer())
        .put('/plans/999999')
        .set(adminHeaders)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });

    it('should delete a plan (DELETE /plans/:id)', async () => {
      // Create a test plan to delete
      const baseTimestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(7);
      
      const testPlan = await prisma.plan.create({
        data: {
          code: `DELETE_TEST_${baseTimestamp}_${uniqueId}`,
          name: 'Plan to Delete',
          priority: 999
        }
      });

      const response = await request(app.getHttpServer())
        .delete(`/plans/${testPlan.id}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('deleted');

      // Verify plan deleted from database
      const deletedPlan = await prisma.plan.findUnique({
        where: { id: testPlan.id }
      });
      expect(deletedPlan).toBeNull();
    });

    it('should handle invalid plan ID for deletion (DELETE /plans/999999)', async () => {
      const response = await request(app.getHttpServer())
        .delete('/plans/999999')
        .set(adminHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });
  });

  describe('Admin Feature Management', () => {
    it('should get all features (GET /features)', async () => {
      const response = await request(app.getHttpServer())
        .get('/features')
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check feature structure
      const feature = response.body[0];
      expect(feature).toHaveProperty('id');
      expect(feature).toHaveProperty('name');
      expect(feature).toHaveProperty('type');
      expect(feature).toHaveProperty('status');
    });

    it('should create a new feature (POST /features)', async () => {
      const baseTimestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(7);
      
      const newFeature = {
        name: `feature_${baseTimestamp}_${uniqueId}`,
        value: `Test Feature ${baseTimestamp}`,
        type: 'feature',
        status: 'ACTIVE',
        weight: 10
      };

      const response = await request(app.getHttpServer())
        .post('/features')
        .set(adminHeaders)
        .send(newFeature)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newFeature.name);
      expect(response.body.value).toBe(newFeature.value);
      expect(response.body.type).toBe(newFeature.type);
      expect(response.body.status).toBe(newFeature.status);

      // Verify feature created in database
      const createdFeature = await prisma.feature.findUnique({
        where: { name: newFeature.name }
      });
      expect(createdFeature).toBeDefined();
      expect(createdFeature!.value).toBe(newFeature.value);
    });

    it('should handle duplicate feature name (POST /features)', async () => {
      const existingFeature = await prisma.feature.findFirst();
      expect(existingFeature).toBeDefined();

      const duplicateFeature = {
        name: existingFeature!.name,
        value: 'Duplicate Feature',
        type: 'feature',
        status: 'ACTIVE',
        weight: 10
      };

      const response = await request(app.getHttpServer())
        .post('/features')
        .set(adminHeaders)
        .send(duplicateFeature)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('already exists');
    });

    it('should update an existing feature (PUT /features/:id)', async () => {
      const existingFeature = await prisma.feature.findFirst();
      expect(existingFeature).toBeDefined();

      const updateData = {
        value: `Updated Feature ${Date.now()}`,
        status: 'INACTIVE',
        weight: 25
      };

      const response = await request(app.getHttpServer())
        .put(`/features/${existingFeature!.id}`)
        .set(adminHeaders)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.value).toBe(updateData.value);
      expect(response.body.status).toBe(updateData.status);
      expect(response.body.weight).toBe(updateData.weight);

      // Verify feature updated in database
      const updatedFeature = await prisma.feature.findUnique({
        where: { id: existingFeature!.id }
      });
      expect(updatedFeature!.value).toBe(updateData.value);
      expect(updatedFeature!.status).toBe(updateData.status);
    });

    it('should handle invalid feature ID (PUT /features/999999)', async () => {
      const updateData = {
        value: 'Updated Feature',
        status: 'ACTIVE'
      };

      const response = await request(app.getHttpServer())
        .put('/features/999999')
        .set(adminHeaders)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });

    it('should delete a feature (DELETE /features/:id)', async () => {
      // Create a test feature to delete
      const baseTimestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(7);
      
      const testFeature = await prisma.feature.create({
        data: {
          name: `delete_test_${baseTimestamp}_${uniqueId}`,
          value: 'Feature to Delete',
          type: 'feature',
          status: 'ACTIVE',
          weight: 999
        }
      });

      const response = await request(app.getHttpServer())
        .delete(`/features/${testFeature.id}`)
        .set(adminHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('deleted');

      // Verify feature deleted from database
      const deletedFeature = await prisma.feature.findUnique({
        where: { id: testFeature.id }
      });
      expect(deletedFeature).toBeNull();
    });

    it('should handle invalid feature ID for deletion (DELETE /features/999999)', async () => {
      const response = await request(app.getHttpServer())
        .delete('/features/999999')
        .set(adminHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });
  });

  describe('Admin Authorization Tests', () => {
    it('should require admin authorization for plan creation', async () => {
      const newPlan = {
        code: 'UNAUTHORIZED_PLAN',
        name: 'Unauthorized Plan',
        priority: 1
      };

      await request(app.getHttpServer())
        .post('/plans')
        .send(newPlan)
        .expect(401);
    });

    it('should require admin authorization for feature creation', async () => {
      const newFeature = {
        name: 'unauthorized_feature',
        value: 'Unauthorized Feature',
        type: 'feature',
        status: 'ACTIVE',
        weight: 10
      };

      await request(app.getHttpServer())
        .post('/features')
        .send(newFeature)
        .expect(401);
    });

    it('should require admin authorization for plan updates', async () => {
      const updateData = {
        name: 'Updated Plan',
        priority: 1
      };

      await request(app.getHttpServer())
        .put('/plans/1')
        .send(updateData)
        .expect(401);
    });

    it('should require admin authorization for feature updates', async () => {
      const updateData = {
        value: 'Updated Feature',
        status: 'ACTIVE'
      };

      await request(app.getHttpServer())
        .put('/features/1')
        .send(updateData)
        .expect(401);
    });

    it('should require admin authorization for plan deletion', async () => {
      await request(app.getHttpServer())
        .delete('/plans/1')
        .expect(401);
    });

    it('should require admin authorization for feature deletion', async () => {
      await request(app.getHttpServer())
        .delete('/features/1')
        .expect(401);
    });
  });
});
