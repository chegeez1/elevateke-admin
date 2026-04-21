import { Layout } from "@/components/layout";
import { useGetTasks, useCompleteTask } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Tasks() {
  const { data: tasks, isLoading } = useGetTasks();
  const completeTaskMut = useCompleteTask();
  const queryClient = useQueryClient();

  const handleComplete = (taskId: number) => {
    completeTaskMut.mutate({ id: taskId }, {
      onSuccess: (res) => {
        toast.success("Task completed!", { description: res.message });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: (err) => {
        toast.error("Failed to complete task", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tasks & Rewards</h1>
          <p className="text-gray-500">Complete simple tasks to earn extra cash.</p>
        </div>

        {isLoading ? (
          <div className="text-center p-8">Loading tasks...</div>
        ) : tasks && tasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map(task => (
              <Card key={task.id} className={task.isCompleted ? "opacity-75 bg-gray-50" : "border-2 hover:border-primary/50 transition-colors"}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      {task.isCompleted ? <CheckCircle2 className="text-green-500" /> : <Circle className="text-gray-300" />}
                      {task.title}
                    </CardTitle>
                    <Badge variant="secondary" className="bg-secondary/10 text-secondary border-none text-sm px-2">
                      + KSH {formatNumber(task.reward)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 text-sm mb-4">{task.description}</p>
                  
                  <div className="flex items-center gap-3 mt-4">
                    {task.link && !task.isCompleted && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={task.link} target="_blank" rel="noopener noreferrer">
                          Open Link <ExternalLink size={14} className="ml-2" />
                        </a>
                      </Button>
                    )}
                    <Button 
                      onClick={() => handleComplete(task.id)} 
                      disabled={task.isCompleted || completeTaskMut.isPending}
                      variant={task.isCompleted ? "ghost" : "default"}
                      className={task.isCompleted ? "text-green-600" : ""}
                    >
                      {task.isCompleted ? "Completed" : completeTaskMut.isPending ? "Processing..." : "Mark as Done"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center p-12 bg-white rounded-xl border border-dashed">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks available</h3>
            <p className="text-gray-500">Check back later for new earning opportunities.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
