import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Trỏ DATABASE_URL sang database test và chặn chạy trên production.
    // Phải nạp trước khi test file import AppModule.
    setupFiles: ['./test/helpers/setup-e2e.ts'],
    // Các kịch bản nghiệp vụ phụ thuộc nhau theo thứ tự (S1 -> ... -> C1)
    // và dùng chung một database, nên không được chạy song song.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
