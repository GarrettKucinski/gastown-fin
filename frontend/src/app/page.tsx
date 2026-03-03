import TradeBar from "@/components/TradeBar";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-accent-yellow mb-4">
            Gastown Finance
          </h1>
          <p className="text-text-secondary text-lg">
            Real-time trading dashboard
          </p>
        </div>
      </div>
      <TradeBar />
    </div>
  );
}
