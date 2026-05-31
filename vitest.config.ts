import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 纯函数测试,使用 node 环境即可
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/game/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'src/game/scene.ts',
        'src/game/trail-renderer.ts',
        'src/game/particles.ts',
        'src/game/watermelon-mesh.ts',
      ],
    },
  },
});
