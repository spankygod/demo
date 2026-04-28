import { redirect } from "next/navigation";

type CoinPageProps = {
  params: Promise<{
    identifier: string;
  }>;
};

export default async function CoinPage({ params }: CoinPageProps) {
  const { identifier } = await params;
  redirect(`/coins/${encodeURIComponent(identifier)}`);
}
