/**
 * Các thang hệ số phổ biến theo Nghị định 204/2004/NĐ-CP (Bảng 1, 2, 3)
 * và các sửa đổi còn hiệu lực. Nghị định 07/2026/NĐ-CP sửa đổi một số phụ cấp
 * chức vụ lãnh đạo, không thay các dãy hệ số ngạch phổ biến dùng ở đây.
 *
 * Dùng để nhận diện ngạch/nhóm lương phục vụ DỰ BÁO nâng bậc. Nếu lịch sử hệ số
 * không đủ để phân biệt giữa nhiều thang có cùng một hệ số, engine không ép chọn.
 */
export const STATE_SALARY_SCALES = [
  {
    id: "senior-expert",
    name: "Chuyên gia cao cấp",
    cadenceMonths: 60,
    coefficients: [8.80, 9.40, 10.00]
  },
  {
    id: "A3.1",
    name: "A3.1",
    cadenceMonths: 36,
    coefficients: [6.20, 6.56, 6.92, 7.28, 7.64, 8.00]
  },
  {
    id: "A3.2",
    name: "A3.2",
    cadenceMonths: 36,
    coefficients: [5.75, 6.11, 6.47, 6.83, 7.19, 7.55]
  },
  {
    id: "A2.1",
    name: "A2.1",
    cadenceMonths: 36,
    coefficients: [4.40, 4.74, 5.08, 5.42, 5.76, 6.10, 6.44, 6.78]
  },
  {
    id: "A2.2",
    name: "A2.2",
    cadenceMonths: 36,
    coefficients: [4.00, 4.34, 4.68, 5.02, 5.36, 5.70, 6.04, 6.38]
  },
  {
    id: "A1",
    name: "A1",
    cadenceMonths: 36,
    coefficients: [2.34, 2.67, 3.00, 3.33, 3.66, 3.99, 4.32, 4.65, 4.98]
  },
  {
    id: "A0",
    name: "A0",
    cadenceMonths: 36,
    coefficients: [2.10, 2.41, 2.72, 3.03, 3.34, 3.65, 3.96, 4.27, 4.58, 4.89]
  },
  {
    id: "B",
    name: "B",
    cadenceMonths: 24,
    coefficients: [1.86, 2.06, 2.26, 2.46, 2.66, 2.86, 3.06, 3.26, 3.46, 3.66, 3.86, 4.06]
  },
  {
    id: "C1",
    name: "C1",
    cadenceMonths: 24,
    coefficients: [1.65, 1.83, 2.01, 2.19, 2.37, 2.55, 2.73, 2.91, 3.09, 3.27, 3.45, 3.63]
  },
  {
    id: "C2-congchuc",
    name: "C2 (công chức)",
    cadenceMonths: 24,
    coefficients: [1.50, 1.68, 1.86, 2.04, 2.22, 2.40, 2.58, 2.76, 2.94, 3.12, 3.30, 3.48]
  },
  {
    id: "C2-vienchuc",
    name: "C2 (một số chức danh viên chức)",
    cadenceMonths: 24,
    coefficients: [2.00, 2.18, 2.36, 2.54, 2.72, 2.90, 3.08, 3.26, 3.44, 3.62, 3.80, 3.98]
  },
  {
    id: "C3",
    name: "C3",
    cadenceMonths: 24,
    coefficients: [1.35, 1.53, 1.71, 1.89, 2.07, 2.25, 2.43, 2.61, 2.79, 2.97, 3.15, 3.33]
  }
];

export function findSalaryScaleCandidates(coefficient, tolerance = 0.005) {
  const value = Number(coefficient);
  if (!Number.isFinite(value) || value <= 0) return [];
  return STATE_SALARY_SCALES
    .map(scale => ({
      scale,
      index: scale.coefficients.findIndex(x => Math.abs(x - value) <= tolerance)
    }))
    .filter(item => item.index >= 0);
}
