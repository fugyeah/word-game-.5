"use client";

export const DegradedBanner = ({ message }: { message: string | null }): JSX.Element | null => {
  if (!message) return null;
  return <div className="mc-banner">{message}</div>;
};
