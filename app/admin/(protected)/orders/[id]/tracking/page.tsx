import { OrderTrackingView } from "@/components/admin/order-tracking-view";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OrderTrackingPage({ params }: PageProps) {
  const { id } = await params;
  return <OrderTrackingView orderId={id} />;
}
