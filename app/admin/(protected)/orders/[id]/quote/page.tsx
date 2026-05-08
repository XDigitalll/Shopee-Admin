import { ExternalOrderQuoteView } from "@/components/admin/external-order-quote-view";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OrderQuotePage({ params }: PageProps) {
  const { id } = await params;
  return <ExternalOrderQuoteView orderId={id} />;
}
