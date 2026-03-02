import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";
import { queryClient } from "@/lib/queryClient";
import type { Document } from "@/lib/schema";

import {
  ArrowLeft, Upload, Download, Trash2, Search, File,
  FileText, Sheet, FileType, ImageIcon, Loader2, FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Constants ──────────────────────────────────────────────────────────────────

const BUCKET_NAME = "documents";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i.test(name)) return ImageIcon;
  if (/\.pdf$/i.test(name)) return FileText;
  if (/\.(xlsx|xls|csv)$/i.test(name)) return Sheet;
  if (/\.(docx|doc)$/i.test(name)) return FileType;
  return File;
}

function getFileColor(name: string): string {
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i.test(name)) return "#8b5cf6";
  if (/\.pdf$/i.test(name)) return "#ef4444";
  if (/\.(xlsx|xls|csv)$/i.test(name)) return "#16a34a";
  if (/\.(docx|doc)$/i.test(name)) return "#2563eb";
  return "#6b7280";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ClientDocuments() {
  const params = useParams();
  const clientId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentOrganization, user } = useAuth();
  const { brandColor } = useBrandColor();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  // Upload form state
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: documents, isLoading } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: async () => {
      if (!currentOrganization) throw new Error("No organization");
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("organization_id", currentOrganization.organization_id)
        .eq("client_id", Number(clientId))
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as Document[];
    },
    enabled: !!currentOrganization && !!clientId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: async ({ name, description, file }: { name: string; description: string; file: File }) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "bin";
        const randomId = Math.random().toString(36).slice(2);
        const filePath = `${currentOrganization.organization_id}/${clientId}/${randomId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, file);
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { error: dbError } = await supabase.from("documents").insert([{
          name,
          description: description || null,
          category: "client",
          file_path: filePath,
          file_size: file.size,
          client_id: Number(clientId),
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }]);

        if (dbError) {
          await supabase.storage.from(BUCKET_NAME).remove([filePath]);
          throw dbError;
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] });
      setIsUploadOpen(false);
      setUploadName("");
      setUploadDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Success", description: "Document uploaded successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: Document) => {
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([doc.file_path]);
      if (storageError) throw new Error(`Failed to delete file: ${storageError.message}`);

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] });
      setDocToDelete(null);
      toast({ title: "Success", description: "Document deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(doc.file_path, 60);
      if (error || !data?.signedUrl) throw new Error("Failed to generate download link");
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleUploadSubmit = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ variant: "destructive", title: "Error", description: "Please choose a file to upload" });
      return;
    }
    // Use entered name or fall back to the original filename (without extension)
    const effectiveName = uploadName.trim() || file.name.replace(/\.[^/.]+$/, "");
    uploadMutation.mutate({ name: effectiveName, description: uploadDescription.trim(), file });
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const filtered = (documents || []).filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Back button ── */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/clients/${clientId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {client?.name || "Client"}
        </Button>
      </div>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client?.name} — Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {documents?.length ?? 0} {documents?.length === 1 ? "file" : "files"}
          </p>
        </div>
        <Button
          style={{ backgroundColor: brandColor }}
          className="text-white hover:opacity-90"
          onClick={() => setIsUploadOpen(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search documents..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ── Document grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-gray-100 p-5 mb-4">
            <FolderOpen className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700">No documents yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            {searchTerm ? "No documents match your search." : "Upload images, PDFs, Excel files and more."}
          </p>
          {!searchTerm && (
            <Button
              style={{ backgroundColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => setIsUploadOpen(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload First Document
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(doc => {
            const Icon = getFileIcon(doc.name);
            const iconColor = getFileColor(doc.name);
            return (
              <Card key={doc.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col gap-3">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${iconColor}18` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: iconColor }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate" title={doc.name}>
                      {doc.name}
                    </p>
                    {doc.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                      <span>{fmtSize(doc.file_size)}</span>
                      <span>·</span>
                      <span>{doc.uploaded_at ? format(new Date(doc.uploaded_at), "MMM d, yyyy") : "—"}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDocToDelete(doc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog open={isUploadOpen} onOpenChange={open => {
        setIsUploadOpen(open);
        if (!open) { setUploadName(""); setUploadDescription(""); if (fileInputRef.current) fileInputRef.current.value = ""; }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Supported formats: images, PDF, Excel, Word and more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name <span className="text-gray-400 font-normal">(optional — defaults to filename)</span></label>
              <Input
                placeholder="e.g. Floor Plan v2"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <Input
                placeholder="Short note about this file"
                value={uploadDescription}
                onChange={e => setUploadDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">File <span className="text-red-500">*</span></label>
              <Input
                type="file"
                ref={fileInputRef}
                accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx,.txt,.zip"
                className="cursor-pointer"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file && !uploadName) {
                    setUploadName(file.name.replace(/\.[^/.]+$/, ""));
                  }
                }}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsUploadOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                onClick={handleUploadSubmit}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Upload</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!docToDelete} onOpenChange={open => { if (!open) setDocToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{docToDelete?.name}</strong>"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => docToDelete && deleteMutation.mutate(docToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
