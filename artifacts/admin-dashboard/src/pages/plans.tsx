import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";

const planSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fixedAmount: z.coerce.number().min(1).optional().nullable(),
  minAmount: z.coerce.number().min(1),
  maxAmount: z.coerce.number().optional().nullable(),
  dailyRate: z.coerce.number().min(0),
  durationDays: z.coerce.number().min(1),
  bonusPercent: z.coerce.number().min(0),
  isActive: z.boolean(),
  description: z.string().optional().nullable(),
});

type PlanFormValues = z.infer<typeof planSchema>;

export default function Plans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => customFetch<any[]>("/api/admin/plans"),
  });

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "",
      fixedAmount: null,
      minAmount: 500,
      dailyRate: 1,
      durationDays: 30,
      bonusPercent: 0,
      isActive: true,
      description: "",
    },
  });

  const createPlan = useMutation({
    mutationFn: (data: PlanFormValues) =>
      customFetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Plan created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating plan", description: err.message, variant: "destructive" });
    },
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PlanFormValues }) =>
      customFetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      toast({ title: "Plan updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error updating plan", description: err.message, variant: "destructive" });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      customFetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
  });

  const onSubmit = (data: PlanFormValues) => {
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan.id, data });
    } else {
      createPlan.mutate(data);
    }
  };

  const openNewPlan = () => {
    setEditingPlan(null);
    form.reset({
      name: "", fixedAmount: null, minAmount: 500, maxAmount: null,
      dailyRate: 1, durationDays: 30, bonusPercent: 0, isActive: true, description: "",
    });
    setIsDialogOpen(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    form.reset({
      name: plan.name,
      fixedAmount: plan.fixedAmount ?? null,
      minAmount: plan.minAmount,
      maxAmount: plan.maxAmount ?? null,
      dailyRate: plan.dailyRate,
      durationDays: plan.durationDays,
      bonusPercent: plan.bonusPercent,
      isActive: plan.isActive,
      description: plan.description ?? "",
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investment Plans</h1>
          <p className="text-muted-foreground text-sm">Manage deposit plans available to users.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewPlan}><Plus className="h-4 w-4 mr-2" />New Plan</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Starter, Silver, Gold" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="fixedAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fixed Amount (KSH) — Optional</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={1} step={1}
                        placeholder="Leave blank for flexible amounts"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      If set, users must deposit exactly this amount. Leave blank to allow any amount within min/max.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="minAmount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Amount (KSH)</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxAmount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Amount (KSH) — Optional</FormLabel>
                      <FormControl>
                        <Input
                          type="number" min={1}
                          placeholder="No max"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="dailyRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily Rate (%)</FormLabel>
                      <FormControl><Input type="number" min={0} step={0.01} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="durationDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Days)</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="bonusPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sign-up Bonus (%)</FormLabel>
                    <FormControl><Input type="number" min={0} step={0.1} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} placeholder="Short description shown to users" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="isActive" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Inactive plans won't be shown to users.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />

                <Button type="submit" className="w-full" disabled={createPlan.isPending || updatePlan.isPending}>
                  {editingPlan ? "Update Plan" : "Create Plan"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Fixed Amount</TableHead>
              <TableHead className="text-right">Min Amount</TableHead>
              <TableHead className="text-right">Daily Rate</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24">Loading plans...</TableCell></TableRow>
            ) : plans.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24 text-muted-foreground">No plans found. Create one above.</TableCell></TableRow>
            ) : (
              plans.map((plan: any) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell className="text-right">
                    {plan.fixedAmount ? (
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                        KSH {plan.fixedAmount?.toLocaleString()}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">flexible</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">KSH {plan.minAmount?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{plan.dailyRate}%</TableCell>
                  <TableCell className="text-right">{plan.durationDays} Days</TableCell>
                  <TableCell>
                    <Switch
                      checked={plan.isActive}
                      onCheckedChange={(checked) => toggleStatus.mutate({ id: plan.id, isActive: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditPlan(plan)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
