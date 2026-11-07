import { appendFileSync, readFileSync } from "node:fs";

export interface LineItem {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export interface Customer {
  id: string;
  region: "US" | "EU";
  previousOrders: number;
}

export interface Order {
  customer: Customer;
  items: LineItem[];
  coupon?: string;
}

export interface Quote {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

const coupons: Record<string, number> = JSON.parse(readFileSync(new URL("../coupons.json", import.meta.url), "utf8"));

export function quote(order: Order): Quote {
  let subtotal = 0;
  for (const item of order.items) {
    subtotal += item.unitPrice * item.quantity;
  }
  let discount = 0;
  if (order.coupon && coupons[order.coupon]) {
    discount = subtotal * coupons[order.coupon];
  }
  const taxable = subtotal - discount;
  const tax = order.customer.region === "EU" ? taxable * 0.2 : taxable * 0.07;
  const shipping = taxable >= 50 ? 0 : 4.99;
  const total = Math.round((taxable + tax + shipping) * 100) / 100;
  return { subtotal, discount, tax, shipping, total };
}

export function checkout(order: Order): string {
  if (order.items.length === 0) throw new Error("empty order");
  let subtotal = 0;
  for (const item of order.items) {
    if (item.quantity <= 0) throw new Error("bad quantity for " + item.sku);
    subtotal += item.unitPrice * item.quantity;
  }
  let discount = 0;
  if (order.coupon) {
    if (!coupons[order.coupon]) throw new Error("unknown coupon " + order.coupon);
    discount = subtotal * coupons[order.coupon];
  }
  const taxable = subtotal - discount;
  const tax = order.customer.region === "EU" ? taxable * 0.2 : taxable * 0.07;
  const shipping = taxable >= 50 ? 0 : 4.99;
  const total = Math.round((taxable + tax + shipping) * 100) / 100;

  const id = "ord_" + Date.now();
  let receipt = "Order " + id + "\n";
  for (const item of order.items) {
    receipt += item.sku + " x" + item.quantity + "  " + (item.unitPrice * item.quantity).toFixed(2) + "\n";
  }
  receipt += "Discount  -" + discount.toFixed(2) + "\n";
  receipt += "Tax  " + tax.toFixed(2) + "\n";
  receipt += "Shipping  " + shipping.toFixed(2) + "\n";
  receipt += "Total  " + total.toFixed(2) + "\n";
  appendFileSync("orders.log", JSON.stringify({ id, customer: order.customer.id, total }) + "\n");
  return receipt;
}
