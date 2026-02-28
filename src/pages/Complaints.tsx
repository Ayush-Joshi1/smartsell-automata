import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

export default function Complaints() {
  const { user, userEmail } = useAuth();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: complaints = [], isLoading, refetch } = useQuery({
    queryKey: ["my-complaints", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userEmail) return;
    if (!subject.trim() || !description.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const customerName = user.user_metadata?.full_name || userEmail || "";
      const payload = {
        user_id: user.id,
        customer_name: customerName,
        customer_email: userEmail,
        subject: subject.trim(),
        description: description.trim(),
        order_id: orderId.trim() || null,
      };

      const { error } = await supabase.from("complaints").insert(payload);
      if (error) throw error;

      // Send to webhook
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(`https://${projectId}.supabase.co/functions/v1/webhook-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ type: "complaint", payload }),
      });

      toast.success("Complaint submitted successfully");
      setSubject("");
      setDescription("");
      setOrderId("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit complaint");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-accent" />
          Complaints
        </h1>
        <p className="mt-2 text-muted-foreground">Submit and track your complaints</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>File a Complaint</CardTitle>
            <CardDescription>
              Filing as <span className="font-medium text-foreground">{userEmail}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderId">Order ID (optional)</Label>
                <Input
                  id="orderId"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="SA-XXXXXXXX-XXXX"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide details about your complaint..."
                  rows={5}
                  maxLength={2000}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Complaint"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4">Your Complaints</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : complaints.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No complaints filed</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {complaints.map((c) => (
                <Card key={c.id} className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{c.subject}</div>
                        <div className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString()}</div>
                      </div>
                      <Badge variant={c.status === "open" ? "destructive" : "secondary"}>{c.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
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
