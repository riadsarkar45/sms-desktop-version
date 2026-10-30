export const formatToErpDate = (date) => {
  if (!date) return "";

  const d = new Date(date);

  if (isNaN(d)) return "";

  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear().toString().slice(-2);

  return `${day}-${month}-${year}`;
};