export interface WeeklyRewardConfig {
  key: string;
  name: string;
  brand: string;
  description: string;
  pointsCost: number;
  emoji: string;
}

export const WEEKLY_REWARDS: WeeklyRewardConfig[] = [
  {
    key: "paytm_20",
    name: "₹20 Paytm Cashback",
    brand: "Paytm",
    description: "₹20 cashback on next recharge or bill payment",
    pointsCost: 500,
    emoji: "💰",
  },
  {
    key: "zomato_delivery",
    name: "Free Zomato Delivery",
    brand: "Zomato",
    description: "Free delivery on your next Zomato order",
    pointsCost: 750,
    emoji: "🛵",
  },
  {
    key: "bookmyshow_25",
    name: "₹25 off BookMyShow",
    brand: "BookMyShow",
    description: "₹25 off on any movie ticket booking",
    pointsCost: 1000,
    emoji: "🎬",
  },
  {
    key: "swiggy_10",
    name: "10% off Swiggy",
    brand: "Swiggy",
    description: "Get 10% off your next Swiggy order (up to ₹100)",
    pointsCost: 1250,
    emoji: "🍔",
  },
  {
    key: "uber_30",
    name: "₹30 off Uber Ride",
    brand: "Uber",
    description: "₹30 discount on your next Uber ride",
    pointsCost: 1500,
    emoji: "🚗",
  },
  {
    key: "myntra_15",
    name: "15% off Myntra",
    brand: "Myntra",
    description: "15% off on Myntra (up to ₹200)",
    pointsCost: 2000,
    emoji: "👕",
  },
  {
    key: "amazon_50",
    name: "₹50 Amazon Voucher",
    brand: "Amazon",
    description: "₹50 Amazon Pay cashback on next purchase",
    pointsCost: 2500,
    emoji: "🛒",
  },
  {
    key: "starbucks_free",
    name: "Free Starbucks Tall",
    brand: "Starbucks",
    description: "One free Tall beverage at any Starbucks",
    pointsCost: 3000,
    emoji: "☕",
  },
];
