using System;
using System.Text.Json.Serialization;

namespace XrayCollector.Models
{
    public class LineDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        
        [JsonPropertyName("description")]
        public string? Description { get; set; }
    }

    public class MachineTypeDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        
        [JsonPropertyName("part_no")]
        public string? PartNo { get; set; }
        
        [JsonPropertyName("log_extension")]
        public string LogExtension { get; set; } = ".log";
    }

    public class MachineDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        
        [JsonPropertyName("ip_address")]
        public string IpAddress { get; set; } = string.Empty;
        
        [JsonPropertyName("line_id")]
        public int LineId { get; set; }
        
        [JsonPropertyName("status")]
        public string Status { get; set; } = "OFFLINE";

        [JsonPropertyName("machine_type_id")]
        public int? MachineTypeId { get; set; }

        [JsonPropertyName("machine_type")]
        public MachineTypeDto? MachineType { get; set; }
    }
}
