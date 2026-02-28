import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductSelect } from "@/components/ProductSelect";
import { toast } from "sonner";
import { Star } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

export default function Reviews() {
  const { user, userEmail } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: reviews = [], refetch } = useQuery({
    queryKey: ["all-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userEmail) return;
    if (!selectedProduct || !title.trim() || !reviewText.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const customerName = user.user_metadata?.full_name || userEmail || "";
      const payload = {
        user_id: user.id,
        product_id: selectedProduct.id,
        customer_name: customerName,
        customer_email: userEmail,
        rating,
        title: title.trim(),
        review_text: reviewText.trim(),
      };

      const { error } = await supabase.from("reviews").insert(payload);
      if (error) throw error;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(`https://${projectId}.supabase.co/functions/v1/webhook-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ type: "review", payload: { ...payload, product_name: selectedProduct.name } }),
      });

      toast.success("Review submitted!");
      setSelectedProduct(null);
      setRating(5);
      setTitle("");
      setReviewText("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Star className="h-8 w-8 text-accent" />
          Product Reviews
        </h1>
        <p className="mt-2 text-muted-foreground">Share your experience with our products</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Write a Review</CardTitle>
            <CardDescription>As <span className="font-medium text-foreground">{userEmail}</span></CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Product *</Label>
                <ProductSelect products={products} value={selectedProduct} onChange={setSelectedProduct} />
              </div>
              <div className="space-y-2">
                <Label>Rating *</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star className={`h-7 w-7 ${s <= rating ? "fill-accent text-accent" : "text-muted"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewTitle">Title *</Label>
                <Input
                  id="reviewTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summary of your review"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewText">Review *</Label>
                <Textarea
                  id="reviewText"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your detailed experience..."
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Review"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Reviews</h2>
          {reviews.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No reviews yet</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id} className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1 mb-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-4 w-4 ${s <= r.rating ? "fill-accent text-accent" : "text-muted"}`} />
                      ))}
                    </div>
                    <div className="font-medium">{r.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.review_text}</p>
                    <div className="mt-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
